import type { PaymentMethod, PaymentStatus } from '@ecommerce/shared/constants'

/**
 * Decide o que o estado de uma order do Mercado Pago significa para a NOSSA
 * tentativa de pagamento. Função pura: recebe o que está gravado e o que o MP
 * diz agora, devolve a transição — sem banco, sem relógio.
 *
 * O estado só anda para a frente. Webhook atrasado, reentregue ou fora de ordem
 * (um "failed" velho chegando depois do "processed") cai num `none`, nunca
 * desfaz um pagamento. FAILED e REFUNDED são finais.
 */

/** O que lemos da order do MP — o recorte do retrato da integração que importa aqui. */
export type MpOrderState = {
  status: string
  statusDetail: string | null
  paidCents: number
  refundedCents: number
  payment: { methodId: string | null; methodType: string | null } | null
}

export type CurrentPayment = {
  status: PaymentStatus
  amount: number
  refundedAmount: number
}

export type MpDecision =
  /** Ainda em curso no MP (Pix aguardando, cartão em análise): só o detalhe muda. */
  | { kind: 'progress' }
  | { kind: 'paid'; method: PaymentMethod | null }
  | { kind: 'failed' }
  | { kind: 'refund'; status: 'REFUNDED' | 'PARTIALLY_REFUNDED'; refundedAmount: number }
  | { kind: 'none'; reason: 'final' | 'unchanged' | 'amount_mismatch' | 'chargeback' | 'refund_before_paid' }

type Target = 'PROCESSING' | 'PAID' | 'FAILED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'CHARGEBACK'

/**
 * Status da order → nosso alvo. O reembolso total aparece de dois jeitos na Orders
 * API: `refunded`, ou `processed` com detalhe `refunded`.
 */
export const mpTarget = (state: Pick<MpOrderState, 'status' | 'statusDetail'>): Target => {
  switch (state.status) {
    case 'processed':
      if (state.statusDetail === 'refunded') return 'REFUNDED'
      if (state.statusDetail === 'partially_refunded') return 'PARTIALLY_REFUNDED'
      return 'PAID'
    case 'refunded':
      return 'REFUNDED'
    case 'failed':
    case 'canceled':
    case 'cancelled':
    case 'expired':
      return 'FAILED'
    case 'charged_back':
      return 'CHARGEBACK'
    default:
      // created, processing, action_required, in_review — e qualquer status novo
      // que o MP invente: não é pago nem perdido, então espera.
      return 'PROCESSING'
  }
}

export const mpPaymentMethod = (payment: MpOrderState['payment']): PaymentMethod | null => {
  if (!payment) return null
  if (payment.methodId === 'pix' || payment.methodType === 'bank_transfer') return 'PIX'
  if (payment.methodType === 'credit_card' || payment.methodType === 'debit_card') return 'CARD'
  return null
}

export const decideMercadoPagoTransition = (
  current: CurrentPayment,
  state: MpOrderState,
): MpDecision => {
  const target = mpTarget(state)

  if (target === 'CHARGEBACK') return { kind: 'none', reason: 'chargeback' }

  switch (current.status) {
    case 'PENDING':
    case 'PROCESSING':
      if (target === 'PROCESSING') return { kind: 'progress' }
      if (target === 'FAILED') return { kind: 'failed' }
      if (target === 'PAID') {
        // Parcelado com juros do comprador pode vir ACIMA do valor; abaixo é o
        // que nunca pode virar "pago".
        if (state.paidCents < current.amount) return { kind: 'none', reason: 'amount_mismatch' }
        return { kind: 'paid', method: mpPaymentMethod(state.payment) }
      }
      // Reembolso de algo que nunca vimos pago: não há o que desfazer aqui.
      return { kind: 'none', reason: 'refund_before_paid' }

    case 'PAID':
    case 'PARTIALLY_REFUNDED': {
      if (target !== 'REFUNDED' && target !== 'PARTIALLY_REFUNDED') {
        return { kind: 'none', reason: 'unchanged' }
      }
      // Total é total mesmo que a lista de reembolsos não venha na notificação.
      const refunded = target === 'REFUNDED' ? current.amount : Math.min(state.refundedCents, current.amount)
      const status = refunded >= current.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
      if (refunded <= current.refundedAmount && status === current.status) {
        return { kind: 'none', reason: 'unchanged' }
      }
      return { kind: 'refund', status, refundedAmount: Math.max(refunded, current.refundedAmount) }
    }

    case 'FAILED':
    case 'REFUNDED':
      return { kind: 'none', reason: 'final' }
  }
}
