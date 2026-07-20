import {
  deriveSituation,
  canCancelOrder,
  type AdminOrder,
  type AdminOrderListItem,
  type OrderPaymentDetail,
} from '@ecommerce/shared/contracts'
import { Prisma } from '@prisma/client'

/**
 * Projeções e tradução linha → DTO.
 *
 * Existe como repository (e não inline no service) porque os SEIS endpoints de
 * escrita devolvem o pedido atualizado: sem um select único, cada um inventaria
 * o seu e a tela receberia formatos ligeiramente diferentes conforme o botão.
 */

export const ADMIN_LIST_SELECT = {
  id: true,
  number: true,
  createdAt: true,
  email: true,
  total: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  canceledAt: true,
  customer: { select: { name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect

export type AdminListRow = Prisma.OrderGetPayload<{ select: typeof ADMIN_LIST_SELECT }>

export const toAdminListItem = (row: AdminListRow): AdminOrderListItem => ({
  id: row.id,
  number: row.number,
  createdAt: row.createdAt.toISOString(),
  customerName: row.customer.name,
  email: row.email,
  itemCount: row._count.items,
  total: row.total,
  paymentStatus: row.paymentStatus,
  fulfillmentStatus: row.fulfillmentStatus,
  canceledAt: row.canceledAt?.toISOString() ?? null,
  situation: deriveSituation(row),
})

export const ADMIN_ORDER_SELECT = {
  id: true,
  number: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  canceledAt: true,
  cancelReason: true,
  email: true,
  phone: true,
  subtotal: true,
  discountTotal: true,
  shippingTotal: true,
  total: true,
  couponCodeSnapshot: true,
  shippingAddressJson: true,
  shippingMethodJson: true,
  customerNote: true,
  internalNote: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, name: true, email: true, phone: true, document: true } },
  items: {
    orderBy: { id: 'asc' },
    select: {
      id: true,
      variantId: true,
      productName: true,
      variantName: true,
      sku: true,
      unitPrice: true,
      quantity: true,
      totalPrice: true,
      weight: true,
      imageUrl: true,
    },
  },
  payments: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
      status: true,
      method: true,
      amount: true,
      refundedAmount: true,
      currency: true,
      paidAt: true,
      refundedAt: true,
      createdAt: true,
    },
  },
  events: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      description: true,
      metadataJson: true,
      userId: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrderSelect

export type AdminOrderRow = Prisma.OrderGetPayload<{ select: typeof ADMIN_ORDER_SELECT }>

export type DtoContext = {
  /**
   * OrderEvent.userId é String SEM relação com User (o evento sobrevive ao
   * funcionário que saiu). O nome vem de uma segunda query, no service.
   */
  userNames: Map<string, string>
  /** Base do dashboard do Stripe já resolvida entre test e live. */
  dashboardBase: string | null
}

/**
 * O reembolsável é do PAGAMENTO que efetivamente pagou, não do total do pedido:
 * um pedido com tentativa falha antes da bem-sucedida tem dois Payments, e só um
 * deles tem dinheiro para devolver.
 */
export const paidPayment = (row: AdminOrderRow): AdminOrderRow['payments'][number] | null =>
  row.payments.find((p) => p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED') ?? null

const toPaymentDTO = (
  p: AdminOrderRow['payments'][number],
  dashboardBase: string | null,
): OrderPaymentDetail => ({
  id: p.id,
  stripePaymentIntentId: p.stripePaymentIntentId,
  stripeChargeId: p.stripeChargeId,
  status: p.status,
  method: p.method,
  amount: p.amount,
  refundedAmount: p.refundedAmount,
  currency: p.currency,
  paidAt: p.paidAt?.toISOString() ?? null,
  refundedAt: p.refundedAt?.toISOString() ?? null,
  createdAt: p.createdAt.toISOString(),
  dashboardUrl: dashboardBase ? `${dashboardBase}/payments/${p.stripePaymentIntentId}` : null,
})

export const toAdminOrderDTO = (row: AdminOrderRow, ctx: DtoContext): AdminOrder => {
  const payment = paidPayment(row)

  return {
    id: row.id,
    number: row.number,
    situation: deriveSituation(row),
    paymentStatus: row.paymentStatus,
    fulfillmentStatus: row.fulfillmentStatus,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,

    customer: {
      id: row.customer.id,
      name: row.customer.name,
      email: row.customer.email,
      phone: row.customer.phone,
      document: row.customer.document,
    },
    email: row.email,
    phone: row.phone,

    shippingAddress: row.shippingAddressJson as AdminOrder['shippingAddress'],
    shippingMethod: row.shippingMethodJson as AdminOrder['shippingMethod'],

    items: row.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      productName: i.productName,
      variantName: i.variantName,
      sku: i.sku,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      totalPrice: i.totalPrice,
      weight: i.weight,
      imageUrl: i.imageUrl,
    })),

    subtotal: row.subtotal,
    discountTotal: row.discountTotal,
    shippingTotal: row.shippingTotal,
    total: row.total,
    couponCodeSnapshot: row.couponCodeSnapshot,

    customerNote: row.customerNote,
    internalNote: row.internalNote,

    payments: row.payments.map((p) => toPaymentDTO(p, ctx.dashboardBase)),
    events: row.events.map((e) => ({
      id: e.id,
      type: e.type,
      description: e.description,
      metadata: (e.metadataJson as Record<string, unknown> | null) ?? null,
      userName: e.userId ? (ctx.userNames.get(e.userId) ?? null) : null,
      createdAt: e.createdAt.toISOString(),
    })),

    canCancel: canCancelOrder(row),
    refundableAmount: payment ? payment.amount - payment.refundedAmount : 0,

    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
