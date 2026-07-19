import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { getSetting, setSetting } from '../../shared/settings.js'
import { appError } from '../../shared/errors.js'
import { logger } from '../../config/logger.js'
import { exchangeCodeForTokens, refreshTokens, type MeTokens } from './oauth.js'

/**
 * Ciclo de vida do access token do Melhor Envio, persistido em Setting.
 *
 * O token é do LOJISTA (a conta com saldo), não do app — por isso não vem do
 * .env: é obtido pelo OAuth e guardado no banco, renovado pelo refresh token sem
 * intervenção. Quem quer chamar a API pede `getValidAccessToken()` e recebe um
 * token válido, ou um erro de negócio claro se a conta nunca foi conectada.
 */

/** Renova se faltar menos de 5 min — evita o token expirar no meio de uma cotação. */
const REFRESH_MARGIN_MS = 5 * 60_000

const persist = async (tokens: MeTokens): Promise<void> => {
  await setSetting('melhor_envio_oauth', {
    state: null,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + tokens.expiresInSeconds * 1000,
  })
}

/** Guarda o `state` antes de mandar o lojista para o consentimento (anti-CSRF). */
export const savePendingState = async (state: string): Promise<void> => {
  const current = await getSetting('melhor_envio_oauth')
  await setSetting('melhor_envio_oauth', { ...current, state })
}

/**
 * Callback do OAuth: valida o state, troca o código por tokens e persiste.
 * State divergente = requisição não iniciada por nós → recusa.
 */
export const completeAuthorization = async (code: string, state: string): Promise<void> => {
  const current = await getSetting('melhor_envio_oauth')
  if (!current.state || current.state !== state) {
    throw appError(ERROR_CODES.UNAUTHORIZED, 'Autorização inválida ou expirada. Tente novamente.', 400)
  }
  const tokens = await exchangeCodeForTokens(code)
  await persist(tokens)
  logger.info('Melhor Envio conectado com sucesso')
}

export const isConnected = async (): Promise<boolean> => {
  const s = await getSetting('melhor_envio_oauth')
  return Boolean(s.accessToken)
}

/** Um access token válido, renovando se estiver perto de expirar. */
export const getValidAccessToken = async (): Promise<string> => {
  const s = await getSetting('melhor_envio_oauth')

  if (!s.accessToken || !s.refreshToken) {
    throw appError(
      ERROR_CODES.SHIPPING_UNAVAILABLE,
      'Frete não configurado: conecte a conta do Melhor Envio.',
      503,
    )
  }

  const stillValid = s.expiresAt && s.expiresAt - Date.now() > REFRESH_MARGIN_MS
  if (stillValid) return s.accessToken

  const renewed = await refreshTokens(s.refreshToken)
  await persist(renewed)
  return renewed.accessToken
}
