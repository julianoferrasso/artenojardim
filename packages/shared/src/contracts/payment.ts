import { z } from 'zod'
import { moneySchema } from './common.js'

/**
 * Pagamento de um pedido, do ponto de vista do front. O formato depende do
 * provedor ativo (PAYMENT_PROVIDER na API) — por isso a união discriminada.
 * Nos dois casos o front NÃO decide valor: o amount sai do total do pedido, no
 * banco, e o status só muda pelo que o provedor confirma ao servidor.
 */

/**
 * Stripe (standby): o backend cria (ou reusa) um PaymentIntent e devolve o
 * `clientSecret` que o Payment Element consome. `status` é o status cru do PI —
 * só guia a UI.
 */
export const stripeOrderPaymentSchema = z.object({
  provider: z.literal('STRIPE'),
  paymentIntentId: z.string(),
  clientSecret: z.string(),
  publishableKey: z.string(),
  status: z.string(),
})

/** Pix em aberto no Mercado Pago: o QR, o copia-e-cola e quando vence. */
export const pixChargeSchema = z.object({
  qrCode: z.string(),
  /** PNG em base64, pronto para `data:image/png;base64,…`. */
  qrCodeBase64: z.string(),
  ticketUrl: z.string().nullable(),
  expiresAt: z.string(),
})

export type PixCharge = z.infer<typeof pixChargeSchema>

/**
 * Mercado Pago: nada é criado ao abrir a tela. A public key não é segredo e vem
 * daqui (não de NEXT_PUBLIC_*, que exigiria rebuild para trocar). `payerEmail` é
 * o que vai ao MP — em modo teste, o e-mail de teste que o MP exige.
 * `cardPending`: a última tentativa com cartão ficou em análise no MP.
 */
export const mercadoPagoOrderPaymentSchema = z.object({
  provider: z.literal('MERCADO_PAGO'),
  publicKey: z.string(),
  amount: moneySchema,
  payerEmail: z.string(),
  pix: pixChargeSchema.nullable(),
  cardPending: z.boolean(),
})

export const orderPaymentSchema = z.discriminatedUnion('provider', [
  stripeOrderPaymentSchema,
  mercadoPagoOrderPaymentSchema,
])

export type OrderPayment = z.infer<typeof orderPaymentSchema>
export type StripeOrderPayment = z.infer<typeof stripeOrderPaymentSchema>
export type MercadoPagoOrderPayment = z.infer<typeof mercadoPagoOrderPaymentSchema>

/**
 * O que o Card Payment Brick entrega e o backend aceita. Repare no que NÃO está
 * aqui: valor e e-mail. O Brick também os tem, e são ignorados de propósito —
 * vêm do pedido, no banco. O CPF vai ao MP e não é gravado nem logado.
 */
export const createCardPaymentSchema = z.object({
  /** Token de uso único gerado pelo MercadoPago.js — o cartão nunca passa por nós. */
  token: z.string().min(8).max(200),
  /** Bandeira, no vocabulário do MP (master, visa, elo…). */
  paymentMethodId: z.string().min(2).max(40),
  paymentType: z.enum(['credit_card', 'debit_card']),
  installments: z.number().int().min(1).max(12),
  identification: z.object({
    type: z.enum(['CPF', 'CNPJ']),
    number: z.string().regex(/^(\d{11}|\d{14})$/, 'Documento inválido'),
  }),
})

export type CreateCardPaymentInput = z.infer<typeof createCardPaymentSchema>

/**
 * Resultado do cartão. Recusa NÃO vem aqui: é 402 PAYMENT_DECLINED, com o
 * motivo em details. PROCESSING = em análise no MP; a tela faz polling.
 */
export const cardPaymentResultSchema = z.object({
  status: z.enum(['PAID', 'PROCESSING']),
})

export type CardPaymentResult = z.infer<typeof cardPaymentResultSchema>
