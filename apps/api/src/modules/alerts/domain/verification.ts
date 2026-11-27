import type { AlertChannel } from '@ecommerce/shared/constants'

/**
 * Regras do código de verificação dos destinos. As genéricas (validade,
 * tentativas, espera do reenvio) moram em `utils/one-time-code.ts`, que o código
 * do e-mail do cliente também usa — reexportadas aqui para o módulo não mudar.
 */
export {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  resendWaitMs,
  attemptsLeftMessage,
} from '../../../utils/one-time-code.js'

/** O link do Telegram vive mais que o código: abrir o app no celular e achar o bot leva tempo. */
export const TELEGRAM_LINK_TTL_MS = 30 * 60_000

/** O texto que vira hash: o id do destino junto impede que o mesmo código em dois destinos gere o mesmo hash. */
export const codeDigestInput = (destinationId: string, code: string): string => `${destinationId}:${code}`

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
