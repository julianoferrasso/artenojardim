import type { AlertChannel } from '@ecommerce/shared/constants'

/**
 * Regras do código de verificação, puras: o relógio entra como parâmetro.
 *
 * Os 6 dígitos sozinhos não seguram força bruta (são 1 milhão de combinações);
 * quem segura é a soma: validade curta, 5 tentativas por código, espera entre
 * reenvios e o rate limit por usuário nas rotas.
 */

export const CODE_TTL_MS = 10 * 60_000
export const MAX_CODE_ATTEMPTS = 5
export const RESEND_COOLDOWN_MS = 60_000
/** O link do Telegram vive mais que o código: abrir o app no celular e achar o bot leva tempo. */
export const TELEGRAM_LINK_TTL_MS = 30 * 60_000

/** O texto que vira hash: o id do destino junto impede que o mesmo código em dois destinos gere o mesmo hash. */
export const codeDigestInput = (destinationId: string, code: string): string => `${destinationId}:${code}`

/** Milissegundos até poder pedir outro código. 0 = já pode. */
export const resendWaitMs = (codeSentAt: Date | null, now: Date): number =>
  codeSentAt ? Math.max(0, codeSentAt.getTime() + RESEND_COOLDOWN_MS - now.getTime()) : 0

export type PendingStep = 'telegram_link' | 'code' | null

/** O que falta para o destino receber alertas. Telegram sem chat ainda espera o "Iniciar". */
export const pendingStepOf = (d: {
  channel: AlertChannel
  address: string | null
  verifiedAt: Date | null
}): PendingStep => {
  if (d.verifiedAt) return null
  return d.channel === 'TELEGRAM' && !d.address ? 'telegram_link' : 'code'
}

export const attemptsLeftMessage = (left: number): string =>
  left === 1 ? 'Resta 1 tentativa.' : `Restam ${left} tentativas.`
