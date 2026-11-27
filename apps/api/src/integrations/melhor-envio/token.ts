import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { getSetting, setSetting } from '../../shared/settings.js'
import { appError, isAppError } from '../../shared/errors.js'
import { logger } from '../../config/logger.js'
import {
  exchangeCodeForTokens,
  refreshTokens,
  tokenRejectionError,
  type MeTokenRejection,
  type MeTokens,
} from './oauth.js'

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

export const getConnectionStatus = async (): Promise<{
  connected: boolean
  expiresAt: number | null
}> => {
  const s = await getSetting('melhor_envio_oauth')
  const connected = Boolean(s.accessToken && s.refreshToken)
  return { connected, expiresAt: connected ? s.expiresAt : null }
}

const notConnected = () =>
  appError(
    ERROR_CODES.SHIPPING_UNAVAILABLE,
    'Frete não configurado: conecte a conta do Melhor Envio.',
    503,
  )

/**
 * Refresh recusado pelo ME (refresh vencido ou revogado).
 *
 * Antes de zerar, relê o banco: se o refresh token gravado já não é o que
 * tentamos, outro processo renovou no meio do caminho (o nosso virou inválido
 * pela rotação) — e o dele vale. Zerar ali derrubaria uma conexão saudável.
 */
const handleRejectedRefresh = async (triedRefreshToken: string): Promise<string> => {
  const current = await getSetting('melhor_envio_oauth')
  if (current.accessToken && current.refreshToken && current.refreshToken !== triedRefreshToken) {
    return current.accessToken
  }

  // Zerado, o status mostra "desconectado" no admin e a cotação falha na hora,
  // sem bater no ME a cada cliente. O `state` fica: pode haver reconexão em curso.
  await setSetting('melhor_envio_oauth', {
    state: current.state,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  })
  logger.error('Melhor Envio desconectado: o refresh foi recusado. Reconecte em /frete no admin.')
  throw notConnected()
}

/** Problema na credencial do APP: corrige-se no admin, sem reautorizar. */
export type MeCredentialProblem = Exclude<MeTokenRejection, 'GRANT_REJECTED'>

const CREDENTIAL_DETAIL = 'appCredentials'

/**
 * O refresh token continua bom: só a credencial do app falhou. Zerar os tokens
 * aqui (como era até 27/11/2026) transformava um Client Secret errado, ou ainda
 * não preenchido, em reautorização obrigatória no navegador — e frete fora do ar
 * até alguém perceber. O motivo vai em `details` para o job avisar a equipe.
 */
const blockedByCredentials = (problem: MeCredentialProblem): never => {
  logger.error(
    { problem },
    'Melhor Envio: renovação bloqueada pelas credenciais do aplicativo. Corrija em /frete no admin (não precisa reconectar).',
  )
  throw tokenRejectionError(problem, [{ field: CREDENTIAL_DETAIL, message: problem }])
}

/** Se o erro veio de uma renovação bloqueada pela credencial do app, qual foi o problema. */
export const credentialProblemOf = (err: unknown): MeCredentialProblem | null => {
  if (!isAppError(err) || err.code !== ERROR_CODES.SHIPPING_UNAVAILABLE) return null
  const problem = err.details?.find((d) => d.field === CREDENTIAL_DETAIL)?.message
  return problem === 'NOT_CONFIGURED' || problem === 'CLIENT_REJECTED' ? problem : null
}

/** EXTERNAL_SERVICE_ERROR (5xx, rede) sobe como exceção e mantém os tokens. */
const renew = async (refreshToken: string): Promise<string> => {
  const result = await refreshTokens(refreshToken)
  if (result.ok) {
    await persist(result.tokens)
    logger.info('Melhor Envio: token renovado')
    return result.tokens.accessToken
  }
  if (result.reason === 'GRANT_REJECTED') return handleRejectedRefresh(refreshToken)
  return blockedByCredentials(result.reason)
}

/**
 * Esquece a conexão. Os tokens pertencem ao aplicativo que os emitiu: trocar de
 * app (ou de ambiente) os torna inúteis, e o status precisa dizer "Desconectado".
 */
export const forgetConnection = async (): Promise<void> => {
  await setSetting('melhor_envio_oauth', { state: null, accessToken: null, refreshToken: null, expiresAt: null })
}

/**
 * Renovação em andamento neste processo. O refresh token rotaciona: duas cotações
 * simultâneas renovando cada uma por conta própria gastariam o mesmo token, e a
 * segunda seria recusada — derrubando a conexão que a primeira acabou de renovar.
 */
let renewing: Promise<string> | null = null

/**
 * Um access token válido por pelo menos `marginMs`, renovando antes disso.
 * A cotação usa a margem curta; o job de renovação usa dias, para que a conexão
 * não dependa de haver tráfego.
 */
export const getValidAccessToken = async (marginMs = REFRESH_MARGIN_MS): Promise<string> => {
  const s = await getSetting('melhor_envio_oauth')

  if (!s.accessToken || !s.refreshToken) throw notConnected()

  const stillValid = s.expiresAt && s.expiresAt - Date.now() > marginMs
  if (stillValid) return s.accessToken

  renewing ??= renew(s.refreshToken).finally(() => {
    renewing = null
  })
  return renewing
}
