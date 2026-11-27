import { ERROR_CODES, type ErrorDetail } from '@ecommerce/shared/contracts'
import { logger } from '../../config/logger.js'
import { appError, externalServiceError } from '../../shared/errors.js'
import { getMeAppConfig, meRedirectUri } from './config.js'

/**
 * OAuth2 do Melhor Envio.
 *
 * Client ID + Secret NÃO autenticam a API — são credenciais do app. O que
 * autentica é um access token, obtido trocando um código de autorização (o lojista
 * autoriza uma vez no navegador). Aqui ficam as três peças do fluxo: montar a URL
 * de consentimento, trocar o código por tokens e renovar pelo refresh token.
 *
 * Vive em integrations/: sabe falar OAuth com o Melhor Envio, não sabe do negócio.
 */

/**
 * Escopos pedidos de uma vez para não reautorizar quando as etiquetas entrarem
 * (Fase 1.16). Hoje só `shipping-calculate` é exercitado.
 */
const SCOPES = [
  'shipping-calculate',
  'shipping-generate',
  'shipping-checkout',
  'shipping-print',
  'shipping-tracking',
  'cart-read',
  'cart-write',
  'ecommerce-shipping',
].join(' ')

export type MeTokens = {
  accessToken: string
  refreshToken: string
  /** epoch ms de expiração, já com margem aplicada por quem grava. */
  expiresInSeconds: number
}

/**
 * Por que o ME não entregou tokens. A distinção decide o destino da conexão:
 * - `GRANT_REJECTED`: o código ou o refresh token morreram — só reautorizando.
 * - `CLIENT_REJECTED` (`invalid_client`) e `NOT_CONFIGURED`: o problema é a
 *   credencial do APP, e o refresh token continua bom. Corrigir no admin basta.
 */
export type MeTokenRejection = 'GRANT_REJECTED' | 'CLIENT_REJECTED' | 'NOT_CONFIGURED'

export type MeTokenResult = { ok: true; tokens: MeTokens } | { ok: false; reason: MeTokenRejection }

type TokenResponse = {
  token_type: string
  expires_in: number
  access_token: string
  refresh_token: string
}

type OAuthConfig = { baseUrl: string; clientId: string; clientSecret: string; redirectUri: string }

/** Config do OAuth, ou `null` se faltar Client ID ou Secret no admin. */
const readOAuthConfig = async (): Promise<OAuthConfig | null> => {
  const { baseUrl, clientId, clientSecret } = await getMeAppConfig()
  if (!clientId || !clientSecret) return null
  return { baseUrl, clientId, clientSecret, redirectUri: meRedirectUri() }
}

const MESSAGES: Record<MeTokenRejection, string> = {
  NOT_CONFIGURED: 'Frete não configurado: preencha as credenciais do Melhor Envio em Frete, no admin.',
  CLIENT_REJECTED:
    'O Melhor Envio recusou as credenciais do aplicativo (Client ID ou Client Secret). Corrija em Frete, no admin.',
  GRANT_REJECTED: 'Não foi possível autenticar no Melhor Envio. Reconecte a conta.',
}

/** A recusa como erro de negócio, para quem não precisa distinguir o motivo. */
export const tokenRejectionError = (reason: MeTokenRejection, details?: ErrorDetail[]) =>
  appError(ERROR_CODES.SHIPPING_UNAVAILABLE, MESSAGES[reason], reason === 'GRANT_REJECTED' ? 400 : 503, details)

const requireOAuthConfig = async (): Promise<OAuthConfig> => {
  const c = await readOAuthConfig()
  if (!c) throw tokenRejectionError('NOT_CONFIGURED')
  return c
}

/** URL de consentimento. `state` é o anti-CSRF, validado no callback. */
export const buildAuthorizeUrl = async (state: string): Promise<string> => {
  const c = await requireOAuthConfig()
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
  })
  return `${c.baseUrl}/oauth/authorize?${params.toString()}`
}

/**
 * Só os campos de diagnóstico do corpo de erro (padrão OAuth/Laravel Passport).
 * Nunca o corpo inteiro: numa resposta inesperada ele poderia trazer token.
 */
const rejectionReason = async (res: Response): Promise<Record<string, string>> => {
  const raw: unknown = await res.json().catch(() => null)
  if (!raw || typeof raw !== 'object') return {}
  const picked: Record<string, string> = {}
  for (const field of ['error', 'error_description', 'hint', 'message']) {
    const value = (raw as Record<string, unknown>)[field]
    if (typeof value === 'string') picked[field] = value.slice(0, 200)
  }
  return picked
}

const postToken = async (baseUrl: string, body: Record<string, string>): Promise<MeTokenResult> => {
  let res: Response
  try {
    res = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
  } catch (err) {
    throw externalServiceError('Melhor Envio', err)
  }

  if (!res.ok) {
    // O motivo do ME é o que separa secret errado (`invalid_client`) de refresh
    // morto (`invalid_grant`/`invalid_request`). Sem ele no log, o incidente de
    // out/2026 só pôde ser diagnosticado lendo o banco.
    const reason = await rejectionReason(res)
    logger.warn({ status: res.status, grantType: body.grant_type, ...reason }, 'Melhor Envio recusou a troca de token')

    if (res.status >= 500) {
      throw externalServiceError('Melhor Envio', new Error(`HTTP ${res.status}`))
    }
    return { ok: false, reason: reason.error === 'invalid_client' ? 'CLIENT_REJECTED' : 'GRANT_REJECTED' }
  }

  const data = (await res.json()) as TokenResponse
  return {
    ok: true,
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresInSeconds: data.expires_in,
    },
  }
}

/** Troca o código de autorização por tokens (uma vez, no callback). */
export const exchangeCodeForTokens = async (code: string): Promise<MeTokens> => {
  const c = await requireOAuthConfig()
  const result = await postToken(c.baseUrl, {
    grant_type: 'authorization_code',
    client_id: c.clientId,
    client_secret: c.clientSecret,
    redirect_uri: c.redirectUri,
    code,
  })
  if (!result.ok) throw tokenRejectionError(result.reason)
  return result.tokens
}

/**
 * Renova o access token pelo refresh token. Recusa definitiva volta como
 * resultado, com o motivo; só falha transitória (5xx, rede) é exceção.
 */
export const refreshTokens = async (refreshToken: string): Promise<MeTokenResult> => {
  const c = await readOAuthConfig()
  if (!c) return { ok: false, reason: 'NOT_CONFIGURED' }
  return postToken(c.baseUrl, {
    grant_type: 'refresh_token',
    client_id: c.clientId,
    client_secret: c.clientSecret,
    refresh_token: refreshToken,
  })
}
