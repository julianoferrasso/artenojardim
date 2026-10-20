import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { env } from '../../config/env.js'
import { appError, isAppError, type AppError } from '../../shared/errors.js'

/**
 * Bot API do Telegram por `fetch`. O token vai DENTRO da URL
 * (`/bot<token>/<método>`) e o logger só mascara campos pelo nome — então a URL
 * nunca entra em erro, log ou `cause`. Nem a mensagem de erro do fetch, que pode
 * ecoá-la: de uma falha de rede só seguem o método e o nome do erro.
 */

const API_URL = 'https://api.telegram.org'

/** O que o Telegram respondeu numa falha, sem nada secreto: vai para `cause` e para o log. */
export type TelegramFailure = {
  provider: 'telegram'
  method: string
  /** HTTP da resposta. 0 = não houve resposta (rede, timeout). */
  status: number
  description: string
  /** 429: segundos até poder tentar de novo. */
  retryAfter?: number
  /** O grupo virou supergrupo e ganhou outro chat_id. */
  migrateToChatId?: string
}

type TelegramEnvelope<T> = {
  ok: boolean
  result?: T
  description?: string
  parameters?: { retry_after?: number; migrate_to_chat_id?: number }
}

const failure = (f: TelegramFailure): AppError =>
  appError(
    ERROR_CODES.EXTERNAL_SERVICE_ERROR,
    `Telegram recusou ${f.method}: ${f.description}`,
    f.status === 0 || f.status >= 500 ? 503 : 502,
    undefined,
    f,
  )

const isTelegramFailure = (value: unknown): value is TelegramFailure =>
  typeof value === 'object' && value !== null && (value as { provider?: unknown }).provider === 'telegram'

/** A resposta do Telegram por trás de um erro desta integração, ou null se o erro é outro. */
export const telegramFailureOf = (err: unknown): TelegramFailure | null =>
  isAppError(err) && isTelegramFailure(err.cause) ? err.cause : null

export const telegramRequest = async <T>(
  method: string,
  payload: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<T> => {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw appError(ERROR_CODES.EXTERNAL_SERVICE_ERROR, 'Telegram não configurado no servidor.', 503)
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error'
    throw failure({
      provider: 'telegram',
      method,
      status: 0,
      description: name === 'TimeoutError' ? 'sem resposta do Telegram' : 'falha de rede',
    })
  }

  const body = (await res.json().catch(() => ({ ok: false }))) as TelegramEnvelope<T>
  if (res.ok && body.ok) return body.result as T

  const retryAfter = body.parameters?.retry_after
  const migrateTo = body.parameters?.migrate_to_chat_id
  throw failure({
    provider: 'telegram',
    method,
    status: res.status,
    description: body.description ?? `HTTP ${res.status}`,
    ...(retryAfter !== undefined ? { retryAfter } : {}),
    ...(migrateTo !== undefined ? { migrateToChatId: String(migrateTo) } : {}),
  })
}

/**
 * O que uma falha de envio diz, na língua do Telegram:
 *  - `unreachable`: o bot não alcança mais o chat (bloqueado, expulso, chat apagado);
 *  - `migrated`: grupo virou supergrupo — reenviar para `migrateToChatId`;
 *  - `bad_token`: o token foi revogado ou está errado — problema do servidor, não do chat;
 *  - `transient`: rede, 5xx ou limite de envio — vale tentar de novo;
 *  - `rejected`: a mensagem em si foi recusada (ex.: HTML que o Telegram não aceita).
 */
export type TelegramFailureKind = 'unreachable' | 'migrated' | 'bad_token' | 'transient' | 'rejected'

const UNREACHABLE_400 = /chat not found|user not found|bot was kicked|not a member|have no rights|not enough rights|group chat was deactivated|chat was deleted|PEER_ID_INVALID/i

export const classifyTelegramFailure = (f: TelegramFailure): TelegramFailureKind => {
  if (f.migrateToChatId) return 'migrated'
  if (f.status === 401 || f.status === 404) return 'bad_token'
  if (f.status === 0 || f.status === 429 || f.status >= 500) return 'transient'
  if (f.status === 403) return 'unreachable'
  if (f.status === 400 && UNREACHABLE_400.test(f.description)) return 'unreachable'
  return 'rejected'
}
