import type { PaymentMethod, PaymentProvider, PaymentStatus } from '@ecommerce/shared/constants'

/**
 * Quando o job `release-reservations` cancela um pedido que não foi pago a tempo.
 * Puro: o service lê o banco e relê o Mercado Pago antes de perguntar aqui.
 *
 * Cancelar é o único jeito seguro de devolver a peça. Soltar só o `reserved`
 * deixaria o pedido pagável, e o pagamento tardio não acharia reserva a liquidar:
 * a loja venderia a mesma peça duas vezes.
 */

/** Folga depois do vencimento: cobre o pagamento que já estava a caminho. */
export const EXPIRY_GRACE_MS = 10 * 60_000

/**
 * Vencido há mais que isto, cancela sem e-mail. A primeira rodada do job pega
 * pedidos abandonados há semanas, e um "seu pedido foi cancelado" de algo que o
 * cliente já esqueceu confunde mais do que informa.
 */
export const EXPIRY_NOTIFY_WINDOW_MS = 24 * 60 * 60_000

export type ExpiryAttempt = {
  provider: PaymentProvider
  method: PaymentMethod | null
  status: PaymentStatus
  /** Vencimento do Pix; null nos demais meios. */
  expiresAt: Date | null
}

export type ExpirySkip = 'NOT_PENDING' | 'IN_GRACE' | 'STRIPE_OPEN' | 'PAYMENT_IN_REVIEW' | 'PIX_OPEN'

export type ExpiryDecision =
  | { action: 'cancel'; notifyCustomer: boolean }
  | { action: 'skip'; reason: ExpirySkip }

export const decideExpiry = (p: {
  paymentStatus: PaymentStatus
  /** O maior `expiresAt` entre as reservas ainda abertas do pedido. */
  latestReservationExpiry: Date
  attempts: ExpiryAttempt[]
  now: Date
}): ExpiryDecision => {
  if (p.paymentStatus !== 'PENDING') return { action: 'skip', reason: 'NOT_PENDING' }

  const expiredFor = p.now.getTime() - p.latestReservationExpiry.getTime()
  if (expiredFor < EXPIRY_GRACE_MS) return { action: 'skip', reason: 'IN_GRACE' }

  const open = p.attempts.filter((a) => a.status === 'PROCESSING')
  // O webhook do Stripe não tem a guarda de "pago com o pedido já cancelado":
  // cancelar aqui poderia confirmar um pedido cancelado sem estorno.
  if (open.some((a) => a.provider === 'STRIPE')) return { action: 'skip', reason: 'STRIPE_OPEN' }
  // Cartão em análise: o MP não deixa cancelar e pode aprovar dias depois. A
  // peça fica segura até ele decidir — aprovado liquida, recusado cai aqui de novo.
  if (open.some((a) => a.method !== 'PIX')) return { action: 'skip', reason: 'PAYMENT_IN_REVIEW' }
  if (open.some((a) => !a.expiresAt || a.expiresAt > p.now)) return { action: 'skip', reason: 'PIX_OPEN' }

  return { action: 'cancel', notifyCustomer: expiredFor < EXPIRY_NOTIFY_WINDOW_MS }
}
