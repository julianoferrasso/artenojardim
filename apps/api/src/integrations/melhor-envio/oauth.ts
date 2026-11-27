import { ERROR_CODES } from '@ecommerce/shared/contracts'
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

type TokenResponse = {
  token_type: string
  expires_in: number
  access_token: string
  refresh_token: string
}

/** Config obrigatória do OAuth. Ausente → frete não configurado (erro de negócio). */
const meOAuthConfig = async (): Promise<{
  baseUrl: string
  clientId: string
  clientSecret: string
  redirectUri: string
}> => {
  const { baseUrl, clientId, clientSecret } = await getMeAppConfig()
  if (!clientId || !clientSecret) {
    throw appError(
      ERROR_CODES.SHIPPING_UNAVAILABLE,
      'Frete não configurado: preencha as credenciais do Melhor Envio em Frete, no admin.',
      503,
    )
  }
  return { baseUrl, clientId, clientSecret, redirectUri: meRedirectUri() }
}

/** URL de consentimento. `state` é o anti-CSRF, validado no callback. */
export const buildAuthorizeUrl = async (state: string): Promise<string> => {
  const c = await meOAuthConfig()
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

const postToken = async (baseUrl: string, body: Record<string, string>): Promise<MeTokens> => {
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
    // morto (`invalid_grant`). Sem ele no log, o incidente de out/2026 só pôde
    // ser diagnosticado lendo o banco.
    logger.warn(
      { status: res.status, grantType: body.grant_type, ...(await rejectionReason(res)) },
      'Melhor Envio recusou a troca de token',
    )

    if (res.status >= 500) {
      throw externalServiceError('Melhor Envio', new Error(`HTTP ${res.status}`))
    }

    // Código expirado/inválido ou refresh revogado: é o lojista que precisa
    // reautorizar. `token.ts` reconhece este code como falha DEFINITIVA.
    throw appError(
      ERROR_CODES.SHIPPING_UNAVAILABLE,
      'Não foi possível autenticar no Melhor Envio. Reconecte a conta.',
      400,
    )
  }

  const data = (await res.json()) as TokenResponse
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSeconds: data.expires_in,
  }
}

/** Troca o código de autorização por tokens (uma vez, no callback). */
export const exchangeCodeForTokens = async (code: string): Promise<MeTokens> => {
  const c = await meOAuthConfig()
  return postToken(c.baseUrl, {
    grant_type: 'authorization_code',
    client_id: c.clientId,
    client_secret: c.clientSecret,
    redirect_uri: c.redirectUri,
    code,
  })
}

/** Renova o access token pelo refresh token (automático, antes de expirar). */
export const refreshTokens = async (refreshToken: string): Promise<MeTokens> => {
  const c = await meOAuthConfig()
  return postToken(c.baseUrl, {
    grant_type: 'refresh_token',
    client_id: c.clientId,
    client_secret: c.clientSecret,
    refresh_token: refreshToken,
  })
}
