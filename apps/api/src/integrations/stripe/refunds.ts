import type Stripe from 'stripe'
import { getStripe, translateStripeError } from './client.js'

/**
 * Resultado NEUTRO de um reembolso. Note o que NÃO está aqui: nada que mude o
 * status do pedido. Criar o refund é só pedir; quem confirma é o evento
 * `charge.refunded`, como em todo o resto do pagamento.
 */
export type RefundResult = {
  id: string
  status: string | null
  amount: number
  chargeId: string | null
}

const toResult = (r: Stripe.Refund): RefundResult => ({
  id: r.id,
  status: r.status,
  amount: r.amount,
  chargeId: typeof r.charge === 'string' ? r.charge : (r.charge?.id ?? null),
})

type CreateRefundInput = {
  paymentIntentId: string
  /** Ausente = total do que ainda não foi reembolsado (o Stripe calcula). */
  amountCents?: number
  reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent'
  /**
   * Dinheiro saindo não perdoa clique duplo. A chave precisa incluir o valor já
   * reembolsado, senão dois reembolsos parciais legítimos e iguais colapsariam
   * em um só.
   */
  idempotencyKey: string
}

export const createRefund = async (input: CreateRefundInput): Promise<RefundResult> => {
  try {
    const refund = await getStripe().refunds.create(
      {
        payment_intent: input.paymentIntentId,
        ...(input.amountCents !== undefined ? { amount: input.amountCents } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      },
      { idempotencyKey: input.idempotencyKey },
    )
    return toResult(refund)
  } catch (err) {
    return translateStripeError(err)
  }
}
