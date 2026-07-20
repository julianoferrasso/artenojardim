import { z } from 'zod'
import {
  paymentStatusSchema,
  fulfillmentStatusSchema,
  paymentMethodSchema,
} from '../constants/enums.js'
import { EVENTS } from '../constants/events.js'
import { moneySchema } from './common.js'
import { orderAddressSchema, orderShippingMethodSchema } from './orders.js'
import { orderSituationSchema } from './order-situation.js'

/**
 * Contratos da tela de pedidos do admin.
 *
 * A lógica de situação (deriveSituation, situationFilter, transições) mora em
 * `order-situation.ts`, porque a área do cliente usa as mesmas funções. Aqui
 * ficam só os DTOs e inputs que são exclusivos do painel.
 */

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export const adminOrderListItemSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  createdAt: z.string(),
  customerName: z.string(),
  email: z.string(),
  itemCount: z.number().int(),
  total: moneySchema,
  paymentStatus: paymentStatusSchema,
  fulfillmentStatus: fulfillmentStatusSchema,
  canceledAt: z.string().nullable(),
  situation: orderSituationSchema,
})

export type AdminOrderListItem = z.infer<typeof adminOrderListItemSchema>

/** Item do pedido para o admin: acrescenta o que a separação precisa. */
export const adminOrderItemSchema = z.object({
  id: z.string(),
  variantId: z.string().nullable(),
  productName: z.string(),
  variantName: z.string(),
  sku: z.string(),
  unitPrice: moneySchema,
  quantity: z.number().int(),
  totalPrice: moneySchema,
  weight: z.number().int(),
  imageUrl: z.string().nullable(),
})

export type AdminOrderItem = z.infer<typeof adminOrderItemSchema>

/** Uma linha da timeline. `userName` é null quando o autor é o sistema. */
export const orderEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  userName: z.string().nullable(),
  createdAt: z.string(),
})

export type OrderEvent = z.infer<typeof orderEventSchema>

/**
 * `dashboardUrl` é montada na API: só ela sabe se a chave é de teste ou live, e
 * o caminho do dashboard do Stripe muda entre os dois.
 */
export const orderPaymentDetailSchema = z.object({
  id: z.string(),
  stripePaymentIntentId: z.string(),
  stripeChargeId: z.string().nullable(),
  status: paymentStatusSchema,
  method: paymentMethodSchema.nullable(),
  amount: moneySchema,
  refundedAmount: moneySchema,
  currency: z.string(),
  paidAt: z.string().nullable(),
  refundedAt: z.string().nullable(),
  createdAt: z.string(),
  dashboardUrl: z.string().nullable(),
})

export type OrderPaymentDetail = z.infer<typeof orderPaymentDetailSchema>

export const adminOrderCustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  document: z.string().nullable(),
})

export const adminOrderSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  situation: orderSituationSchema,
  paymentStatus: paymentStatusSchema,
  fulfillmentStatus: fulfillmentStatusSchema,
  canceledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),

  customer: adminOrderCustomerSchema,
  email: z.string(),
  phone: z.string().nullable(),

  shippingAddress: orderAddressSchema,
  shippingMethod: orderShippingMethodSchema,

  items: z.array(adminOrderItemSchema),

  subtotal: moneySchema,
  discountTotal: moneySchema,
  shippingTotal: moneySchema,
  total: moneySchema,
  couponCodeSnapshot: z.string().nullable(),

  customerNote: z.string().nullable(),
  internalNote: z.string().nullable(),

  payments: z.array(orderPaymentDetailSchema),
  events: z.array(orderEventSchema),

  /** Derivados, para o front não repetir a regra de guarda. */
  canCancel: z.boolean(),
  refundableAmount: moneySchema,

  createdAt: z.string(),
  updatedAt: z.string(),
})

export type AdminOrder = z.infer<typeof adminOrderSchema>

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const ORDER_SORTABLE = ['createdAt', 'number', 'total'] as const

export const adminOrderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  situation: orderSituationSchema.optional(),
  /** "#1042", e-mail ou nome do cliente. */
  q: z.string().max(120).optional(),
  customerId: z.string().optional(),
  /** ISO date (YYYY-MM-DD). `to` é inclusivo — vira fim do dia no service. */
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.string().optional(),
})

export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>

/**
 * NÃO existe `paymentStatus` aqui, e é deliberado: só o webhook do Stripe muda
 * pagamento (regra 6). Um campo opcional neste schema viraria, em algum
 * momento, um botão "marcar como pago" e a contabilidade deixaria de fechar.
 */
export const updateFulfillmentSchema = z.object({
  fulfillmentStatus: fulfillmentStatusSchema,
  note: z.string().max(500).optional(),
  /**
   * Vai para o metadataJson do evento de envio — marcar SHIPPED é o momento
   * natural de informá-lo. Não há coluna de rastreio; ver order-attachments.ts.
   */
  trackingCode: z.string().trim().max(60).optional(),
  trackingUrl: z.string().url().max(300).optional(),
})

export type UpdateFulfillmentInput = z.infer<typeof updateFulfillmentSchema>

export const cancelOrderSchema = z.object({
  reason: z.string().min(3, 'Descreva o motivo do cancelamento').max(500),
})

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>

export const REFUND_REASONS = ['requested_by_customer', 'duplicate', 'fraudulent'] as const
export const refundReasonSchema = z.enum(REFUND_REASONS)

export const refundOrderSchema = z.object({
  /** Ausente = reembolso total do saldo restante. */
  amount: moneySchema.positive().optional(),
  reason: refundReasonSchema.default('requested_by_customer'),
})

export type RefundOrderInput = z.infer<typeof refundOrderSchema>

export const internalNoteSchema = z.object({
  internalNote: z.string().max(2000),
})

export type InternalNoteInput = z.infer<typeof internalNoteSchema>

/**
 * O que o staff pode postar à mão. Enum fechado de propósito: `type` livre
 * viraria uma timeline com vocabulário inventado, e a loja — que rotula pelo
 * tipo — não saberia o que fazer com "saiu pra entrega!!" escrito à mão.
 */
export const STAFF_EVENT_TYPES = [EVENTS.order.noteAdded, EVENTS.order.outForDelivery] as const

export const addOrderEventSchema = z.object({
  description: z.string().min(1).max(500),
  type: z.enum(STAFF_EVENT_TYPES).default(EVENTS.order.noteAdded),
  /**
   * Não existe coluna de rastreio nem de nota fiscal. Estes campos vivem no
   * metadataJson do evento e a loja os lê por convenção — ver
   * `order-attachments.ts`, que documenta o acordo e o gatilho para virar coluna.
   */
  metadata: z
    .object({
      trackingCode: z.string().trim().max(60).optional(),
      trackingUrl: z.string().url().max(300).optional(),
      invoiceUrl: z.string().url().max(300).optional(),
      invoiceNumber: z.string().trim().max(60).optional(),
    })
    .optional(),
})

/**
 * Dois tipos porque há dois lados: quem CHAMA omite `type` (o default resolve),
 * quem RECEBE já passou pelo `validate()` e sempre tem o campo preenchido. Um
 * `z.infer` só serviria mal aos dois — o front seria obrigado a repetir o
 * default e o service teria que checar `undefined` que nunca chega.
 */
export type AddOrderEventInput = z.input<typeof addOrderEventSchema>
export type AddOrderEventData = z.output<typeof addOrderEventSchema>
