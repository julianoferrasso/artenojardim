import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { appError, externalServiceError, type AppError } from '../../shared/errors.js'

/**
 * Cliente HTTP do Mercado Pago. `fetch` e não o SDK oficial (`mercadopago`), por
 * dois defeitos dele que custariam dinheiro:
 *
 *  - cada método MUTA a config compartilhada com as opções da chamada: num
 *    cliente reaproveitado, o X-Idempotency-Key de uma criação vaza para o
 *    cancelamento seguinte, que o MP responderia como repetição;
 *  - num cartão recusado o MP responde 402 COM a order criada no corpo, e o SDK
 *    joga esse corpo fora — perderíamos o id da tentativa e o motivo da recusa.
 */

const BASE_URL = 'https://api.mercadopago.com'

export const isMercadoPagoConfigured = (): boolean => !!env.MP_ACCESS_TOKEN && !!env.MP_PUBLIC_KEY

// Configuração ausente não é "serviço fora do ar", mas para o cliente o efeito é
// o mesmo: pagamento indisponível agora. O log de boot/requisição diz o porquê.
const unavailable = (): AppError =>
  appError(ERROR_CODES.EXTERNAL_SERVICE_ERROR, 'Pagamento indisponível no momento.', 503)

/** A public key NÃO é segredo — vai para o front inicializar o Brick. */
export const getMpPublicKey = (): string => {
  if (!env.MP_PUBLIC_KEY) throw unavailable()
  return env.MP_PUBLIC_KEY
}

type MpRequest = {
  method?: 'GET' | 'POST'
  body?: unknown
  /** Obrigatório nas escritas: é o que torna o clique duplo inofensivo. */
  idempotencyKey?: string
}

/** Resposta crua: o 402 da criação traz a order, e só quem chama sabe usá-la. */
export type MpResponse = { status: number; body: unknown }

export const mpRequest = async (
  path: string,
  { method = 'GET', body, idempotencyKey }: MpRequest = {},
): Promise<MpResponse> => {
  if (!env.MP_ACCESS_TOKEN) throw unavailable()

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      // 10 s cabem com folga nos 22 s que o MP dá ao webhook para responder.
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    throw externalServiceError('Mercado Pago', err)
  }

  return { status: res.status, body: await res.json().catch(() => ({})) }
}

/** Mensagens do MP podem ecoar o valor recusado (CPF, e-mail): sequências longas de dígitos saem do log. */
const scrub = (text: string | undefined): string | undefined => text?.replace(/\d{6,}/g, '***')

/**
 * Traduz um não-2xx do MP em erro nosso. Loga os códigos que o MP devolveu —
 * é a única pista quando algo do payload foi recusado — sem dados do pagador.
 */
export const mpFailure = (path: string, res: MpResponse): AppError => {
  const errors = (res.body as { errors?: Array<{ code?: string; message?: string }> })?.errors
  logger.warn(
    {
      path,
      status: res.status,
      errors: errors?.map((e) => ({ code: e.code, message: scrub(e.message) })),
    },
    'Mercado Pago respondeu erro',
  )
  const reason = res.status === 401 || res.status === 403 ? 'credenciais recusadas' : `HTTP ${res.status}`
  return externalServiceError('Mercado Pago', new Error(reason))
}
