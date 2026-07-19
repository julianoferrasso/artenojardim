import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { env } from '../../config/env.js'
import { appError, externalServiceError } from '../../shared/errors.js'

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
export const meOAuthConfig = (): {
  baseUrl: string
  clientId: string
  clientSecret: string
  redirectUri: string
} => {
  const { MELHOR_ENVIO_CLIENT_ID, MELHOR_ENVIO_CLIENT_SECRET, MELHOR_ENVIO_REDIRECT_URI } = env
  if (!MELHOR_ENVIO_CLIENT_ID || !MELHOR_ENVIO_CLIENT_SECRET || !MELHOR_ENVIO_REDIRECT_URI) {
    throw appError(
      ERROR_CODES.SHIPPING_UNAVAILABLE,
      'Frete não configurado: faltam as credenciais do Melhor Envio.',
      503,
    )
  }
  return {
    baseUrl: env.MELHOR_ENVIO_BASE_URL,
    clientId: MELHOR_ENVIO_CLIENT_ID,
    clientSecret: MELHOR_ENVIO_CLIENT_SECRET,
    redirectUri: MELHOR_ENVIO_REDIRECT_URI,
  }
}

/** URL de consentimento. `state` é o anti-CSRF, validado no callback. */
export const buildAuthorizeUrl = (state: string): string => {
  const c = meOAuthConfig()
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
  })
  return `${c.baseUrl}/oauth/authorize?${params.toString()}`
}

const postToken = async (body: Record<string, string>): Promise<MeTokens> => {
  const c = meOAuthConfig()
  let res: Response
  try {
    res = await fetch(`${c.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
  } catch (err) {
    throw externalServiceError('Melhor Envio', err)
  }

  if (!res.ok) {
    // Código expirado/inválido ou refresh revogado. Não é 503: é o lojista que
    // precisa reautorizar. 400 de negócio com code estável.
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
export const exchangeCodeForTokens = (code: string): Promise<MeTokens> => {
  const c = meOAuthConfig()
  return postToken({
    grant_type: 'authorization_code',
    client_id: c.clientId,
    client_secret: c.clientSecret,
    redirect_uri: c.redirectUri,
    code,
  })
}

/** Renova o access token pelo refresh token (automático, antes de expirar). */
export const refreshTokens = (refreshToken: string): Promise<MeTokens> => {
  const c = meOAuthConfig()
  return postToken({
    grant_type: 'refresh_token',
    client_id: c.clientId,
    client_secret: c.clientSecret,
    refresh_token: refreshToken,
  })
}
