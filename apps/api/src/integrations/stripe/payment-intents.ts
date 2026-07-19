import type Stripe from 'stripe'
import { getStripe, translateStripeError } from './client.js'

/**
 * Resultado NEUTRO de um PaymentIntent: o módulo de pagamentos consome isto e
 * nunca o tipo do SDK, mantendo a regra "um módulo não conhece o Stripe direto".
 */
export type PaymentIntentResult = {
  id: string
  clientSecret: string | null
  status: string
  currency: string
  /** Tipo do método usado (card/pix/boleto), quando já houve cobrança. */
  paymentMethodType: string | null
  /** Id da cobrança (charge) — preenchido após o pagamento. */
  chargeId: string | null
}

const toResult = (pi: Stripe.PaymentIntent): PaymentIntentResult => {
  const charge =
    typeof pi.latest_charge === 'object' && pi.latest_charge !== null ? pi.latest_charge : null
  return {
    id: pi.id,
    clientSecret: pi.client_secret,
    status: pi.status,
    currency: pi.currency,
    paymentMethodType: charge?.payment_method_details?.type ?? null,
    chargeId: charge?.id ?? (typeof pi.latest_charge === 'string' ? pi.latest_charge : null),
  }
}

type CreateInput = {
  orderId: string
  amountCents: number
  metadata: Record<string, string>
}

/**
 * Cria o PaymentIntent do pedido. `automatic_payment_methods` deixa o Payment
 * Element mostrar o que estiver ativo no dashboard (cartão, Pix). A idempotencyKey
 * derivada do orderId garante que dois cliques (ou uma corrida) resolvam no MESMO
 * PI, nunca em dois. O orderId vai no metadata para o webhook casar o evento.
 */
export const createPaymentIntent = async (input: CreateInput): Promise<PaymentIntentResult> => {
  try {
    const pi = await getStripe().paymentIntents.create(
      {
        amount: input.amountCents,
        currency: 'brl',
        automatic_payment_methods: { enabled: true },
        metadata: { orderId: input.orderId, ...input.metadata },
      },
      { idempotencyKey: `pi_order_${input.orderId}` },
    )
    return toResult(pi)
  } catch (err) {
    return translateStripeError(err)
  }
}

export const retrievePaymentIntent = async (id: string): Promise<PaymentIntentResult> => {
  try {
    const pi = await getStripe().paymentIntents.retrieve(id, { expand: ['latest_charge'] })
    return toResult(pi)
  } catch (err) {
    return translateStripeError(err)
  }
}
