import { z } from 'zod'
import {
  paymentStatusSchema,
  fulfillmentStatusSchema,
  paymentMethodSchema,
  type PaymentStatus,
  type FulfillmentStatus,
} from '../constants/enums.js'
import { moneySchema } from './common.js'
import { orderAddressSchema, orderShippingMethodSchema } from './orders.js'

/**
 * Contratos da tela de pedidos do admin.
 *
 * O banco guarda DOIS eixos independentes (paymentStatus e fulfillmentStatus)
 * porque um pedido pago pode estar em qualquer ponto da expedição. O operador,
 * porém, pensa em UM estado: "onde este pedido está agora?".
 *
 * A conciliação é `deriveSituation` — função PURA, usada pelo chip da lista E
 * pelo filtro do backend (via `situationFilter`). Ter os dois lados saindo da
 * mesma fonte é o que impede a lista filtrada por "Enviado" mostrar um pedido
 * que o detalhe chama de outra coisa.
 */

export const ORDER_SITUATIONS = [
  'AWAITING_PAYMENT',
  'PAYMENT_FAILED',
  'PAID',
  'PICKING',
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
  'CANCELED',
  'REFUNDED',
] as const

export const orderSituationSchema = z.enum(ORDER_SITUATIONS)
export type OrderSituation = z.infer<typeof orderSituationSchema>

type SituationInput = {
  canceledAt: string | Date | null
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
}

/**
 * Precedência: cancelado > reembolsado > logística > pagamento.
 *
 * Cancelado vence tudo porque é o fim da linha operacional — não importa que a
 * expedição diga PICKING, ninguém vai separar. Reembolsado vem antes da
 * logística pela mesma razão: dinheiro devolvido encerra o caso.
 */
export const deriveSituation = (o: SituationInput): OrderSituation => {
  if (o.canceledAt) return 'CANCELED'
  if (o.paymentStatus === 'REFUNDED' || o.paymentStatus === 'PARTIALLY_REFUNDED') return 'REFUNDED'

  switch (o.fulfillmentStatus) {
    case 'RETURNED':
      return 'RETURNED'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'SHIPPED':
      return 'SHIPPED'
    case 'PICKING':
    case 'READY_TO_SHIP':
      return 'PICKING'
    case 'UNFULFILLED':
      break
  }

  if (o.paymentStatus === 'PAID') return 'PAID'
  if (o.paymentStatus === 'FAILED') return 'PAYMENT_FAILED'
  return 'AWAITING_PAYMENT'
}

/**
 * Inverso de `deriveSituation`: descritor NEUTRO (sem Prisma) que o service
 * traduz em `where`. Fica aqui, e não no service, para nascer e morrer junto da
 * função que deriva — mudar uma sem a outra é o bug que este arquivo evita.
 */
export type SituationFilter = {
  canceled?: boolean
  paymentStatus?: readonly PaymentStatus[]
  fulfillmentStatus?: readonly FulfillmentStatus[]
}

const REFUNDED_PAYMENTS = ['REFUNDED', 'PARTIALLY_REFUNDED'] as const
const LIVE_PAYMENTS = ['PENDING', 'PROCESSING', 'PAID', 'FAILED'] as const

export const situationFilter = (s: OrderSituation): SituationFilter => {
  switch (s) {
    case 'CANCELED':
      return { canceled: true }
    case 'REFUNDED':
      return { canceled: false, paymentStatus: REFUNDED_PAYMENTS }
    case 'RETURNED':
      return { canceled: false, paymentStatus: LIVE_PAYMENTS, fulfillmentStatus: ['RETURNED'] }
    case 'DELIVERED':
      return { canceled: false, paymentStatus: LIVE_PAYMENTS, fulfillmentStatus: ['DELIVERED'] }
    case 'SHIPPED':
      return { canceled: false, paymentStatus: LIVE_PAYMENTS, fulfillmentStatus: ['SHIPPED'] }
    case 'PICKING':
      return {
        canceled: false,
        paymentStatus: LIVE_PAYMENTS,
        fulfillmentStatus: ['PICKING', 'READY_TO_SHIP'],
      }
    case 'PAID':
      return { canceled: false, paymentStatus: ['PAID'], fulfillmentStatus: ['UNFULFILLED'] }
    case 'PAYMENT_FAILED':
      return { canceled: false, paymentStatus: ['FAILED'], fulfillmentStatus: ['UNFULFILLED'] }
    case 'AWAITING_PAYMENT':
      return {
        canceled: false,
        paymentStatus: ['PENDING', 'PROCESSING'],
        fulfillmentStatus: ['UNFULFILLED'],
      }
  }
}

/**
 * Transições de expedição permitidas ao admin.
 *
 * Não há volta de SHIPPED: a etiqueta já foi comprada e o pacote saiu — o
 * caminho de volta do mundo real é RETURNED, não "desfazer". As voltas curtas
 * (PICKING → UNFULFILLED) existem porque clicar errado no menu é comum e nada
 * físico aconteceu ainda.
 */
export const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, readonly FulfillmentStatus[]> = {
  UNFULFILLED: ['PICKING'],
  PICKING: ['READY_TO_SHIP', 'UNFULFILLED'],
  READY_TO_SHIP: ['SHIPPED', 'PICKING'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  RETURNED: [],
}

export type TransitionContext = {
  paymentStatus: PaymentStatus
  canceled: boolean
}

/**
 * Separar o que não foi pago é o erro operacional caro: o produto sai da
 * prateleira, alguém embala, e o pagamento nunca vem. Por isso sair de
 * UNFULFILLED exige PAID.
 */
export const canTransitionFulfillment = (
  from: FulfillmentStatus,
  to: FulfillmentStatus,
  ctx: TransitionContext,
): boolean => {
  if (ctx.canceled) return false
  if (!FULFILLMENT_TRANSITIONS[from].includes(to)) return false
  if (from === 'UNFULFILLED' && to === 'PICKING') return ctx.paymentStatus === 'PAID'
  return true
}

/** Cancelar depois que o pacote saiu não é cancelar — é devolução. */
export const CANCELABLE_FULFILLMENTS: readonly FulfillmentStatus[] = ['UNFULFILLED', 'PICKING']

export const canCancelOrder = (o: {
  canceledAt: string | Date | null
  fulfillmentStatus: FulfillmentStatus
}): boolean => !o.canceledAt && CANCELABLE_FULFILLMENTS.includes(o.fulfillmentStatus)

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

export const addOrderEventSchema = z.object({
  description: z.string().min(1).max(500),
})

export type AddOrderEventInput = z.infer<typeof addOrderEventSchema>
