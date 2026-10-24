import {
  deriveSituation,
  buildCustomerTimeline,
  readOrderAttachments,
  estimateDelivery,
  estimateProductionDue,
  customerCancelMode,
  type CustomerOrder,
  type CustomerOrderListItem,
  type Order,
  type OrderShippingMethod,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { Prisma } from '@prisma/client'
import { CUSTOMER_THREAD_SELECT, toCustomerThread } from '../support/service.js'

/**
 * Projeções e tradução linha → DTO da área do cliente.
 *
 * Tem select PRÓPRIO, e não o do admin, exatamente porque a diferença entre as
 * duas telas é o que não se mostra: nota interna, id do funcionário e
 * identificadores do Stripe existem no pedido e não podem sair daqui. Um
 * `select` explícito é o que garante isso — um `include` deixaria o vazamento a
 * uma linha de distância.
 */

// ── Lista ────────────────────────────────────────────────────────────────────

/**
 * O card mostra UMA miniatura e uma contagem, então a query traz uma linha de
 * item e um COUNT — não os itens todos. `take: 1` vira uma query lateral por
 * pedido, de custo fixo: a página custa o mesmo para quem comprou 1 vela e para
 * quem comprou 40.
 */
export const CUSTOMER_LIST_SELECT = {
  id: true,
  number: true,
  createdAt: true,
  total: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  canceledAt: true,
  shippingMethodJson: true,
  productionDays: true,
  _count: { select: { items: true } },
  items: {
    orderBy: { totalPrice: 'desc' },
    take: 1,
    select: { productName: true, imageUrl: true },
  },
  payments: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { method: true, paidAt: true },
  },
} satisfies Prisma.OrderSelect

export type CustomerListRow = Prisma.OrderGetPayload<{ select: typeof CUSTOMER_LIST_SELECT }>

const shippingMethodOf = (value: Prisma.JsonValue): OrderShippingMethod =>
  value as unknown as OrderShippingMethod

export const toCustomerListItem = (row: CustomerListRow): CustomerOrderListItem => {
  const highlight = row.items[0]
  const payment = row.payments[0]

  return {
    id: row.id,
    number: row.number,
    createdAt: row.createdAt.toISOString(),
    situation: deriveSituation(row),
    total: row.total,
    itemCount: row._count.items,
    // Pedido sem item não deveria existir, mas um card em branco é pior que um
    // rótulo genérico se algum dia existir.
    highlightName: highlight?.productName ?? 'Pedido',
    highlightImageUrl: highlight?.imageUrl ?? null,
    paymentMethod: payment?.method ?? null,
    estimatedDeliveryAt: estimateDelivery({
      shippedAt: null,
      paidAt: payment?.paidAt ?? null,
      deliveryDays: shippingMethodOf(row.shippingMethodJson).deliveryDays,
      productionDays: row.productionDays,
    }),
  }
}

// ── Detalhe ──────────────────────────────────────────────────────────────────

export const CUSTOMER_ORDER_SELECT = {
  id: true,
  number: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  canceledAt: true,
  cancelReason: true,
  cancelRequestedAt: true,
  email: true,
  subtotal: true,
  discountTotal: true,
  shippingTotal: true,
  total: true,
  couponCodeSnapshot: true,
  shippingAddressJson: true,
  shippingMethodJson: true,
  productionDays: true,
  customerNote: true,
  createdAt: true,
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
      imageUrl: true,
      madeToOrderQuantity: true,
      // Só para decidir se "comprar de novo" e o link do produto aparecem.
      variant: {
        select: {
          isActive: true,
          product: { select: { slug: true, status: true, deletedAt: true } },
        },
      },
    },
  },
  // SEM stripePaymentIntentId e SEM stripeChargeId: identificador de gateway
  // não tem uso na conta do cliente e é superfície de ataque de graça.
  payments: {
    orderBy: { createdAt: 'desc' },
    select: {
      status: true,
      method: true,
      amount: true,
      refundedAmount: true,
      paidAt: true,
      createdAt: true,
    },
  },
  // SEM userId: o cliente não conhece — nem precisa conhecer — o funcionário.
  events: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, type: true, description: true, metadataJson: true, createdAt: true },
  },
  supportThread: { select: CUSTOMER_THREAD_SELECT },
} satisfies Prisma.OrderSelect

export type CustomerOrderRow = Prisma.OrderGetPayload<{ select: typeof CUSTOMER_ORDER_SELECT }>

/**
 * O motivo do cancelamento só volta ao cliente quando foi ELE que escreveu —
 * cancelando sozinho, ou pedindo e a loja aprovando (o motivo segue sendo o
 * dele) — ou quando é o texto fixo do vencimento do prazo de pagamento (`system`).
 * Quando o staff cancelou por conta própria, `cancelReason` é anotação
 * operacional ("suspeita de fraude", "cliente sumiu") — texto que nunca foi
 * endereçado a ele.
 */
const customerVisibleCancelReason = (row: CustomerOrderRow): string | null => {
  if (!row.cancelReason) return null
  const canceledEvent = row.events.find((e) => e.type === EVENTS.order.canceled)
  const meta = canceledEvent?.metadataJson
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return null
  const { by, approvedRequest } = meta as Record<string, unknown>
  return by === 'customer' || by === 'system' || approvedRequest === true ? row.cancelReason : null
}

export const toCustomerOrderDTO = (row: CustomerOrderRow): CustomerOrder => {
  const { entries, steps } = buildCustomerTimeline(row.events, {
    canceled: !!row.canceledAt,
    madeToOrder: row.productionDays > 0,
  })
  const attachments = readOrderAttachments(row.events)

  const paidPayment = row.payments.find(
    (p) => p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED',
  )
  const payment = paidPayment ?? row.payments[0]
  const shippedEvent = row.events.find((e) => e.type === EVENTS.order.shipped)

  return {
    id: row.id,
    number: row.number,
    situation: deriveSituation(row),
    paymentStatus: row.paymentStatus,
    fulfillmentStatus: row.fulfillmentStatus,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    cancelReason: customerVisibleCancelReason(row),
    email: row.email,
    subtotal: row.subtotal,
    discountTotal: row.discountTotal,
    shippingTotal: row.shippingTotal,
    total: row.total,
    couponCodeSnapshot: row.couponCodeSnapshot,
    shippingAddress: row.shippingAddressJson as unknown as Order['shippingAddress'],
    shippingMethod: shippingMethodOf(row.shippingMethodJson),
    productionDays: row.productionDays,
    items: row.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      productName: i.productName,
      variantName: i.variantName,
      sku: i.sku,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      totalPrice: i.totalPrice,
      imageUrl: i.imageUrl,
      madeToOrderQuantity: i.madeToOrderQuantity,
      productSlug: i.variant?.product.slug ?? null,
      reorderable:
        !!i.variantId &&
        !!i.variant?.isActive &&
        i.variant.product.status === 'ACTIVE' &&
        !i.variant.product.deletedAt,
    })),
    timeline: entries,
    steps,
    payment: payment
      ? {
          status: payment.status,
          method: payment.method,
          amount: payment.amount,
          refundedAmount: payment.refundedAmount,
          paidAt: payment.paidAt?.toISOString() ?? null,
        }
      : null,
    // Depois do envio a produção já passou: a data some, fica a da entrega.
    productionDueAt: shippedEvent
      ? null
      : estimateProductionDue({ paidAt: paidPayment?.paidAt ?? null, productionDays: row.productionDays }),
    estimatedDeliveryAt: estimateDelivery({
      shippedAt: shippedEvent?.createdAt ?? null,
      paidAt: paidPayment?.paidAt ?? null,
      deliveryDays: shippingMethodOf(row.shippingMethodJson).deliveryDays,
      productionDays: row.productionDays,
    }),
    trackingCode: attachments.trackingCode,
    trackingUrl: attachments.trackingUrl,
    invoiceUrl: attachments.invoiceUrl,
    invoiceNumber: attachments.invoiceNumber,
    cancelMode: customerCancelMode(row),
    cancelRequestedAt: row.cancelRequestedAt && !row.canceledAt ? row.cancelRequestedAt.toISOString() : null,
    cancelRefundAmount: paidPayment ? Math.max(0, paidPayment.amount - paidPayment.refundedAmount) : 0,
    support: toCustomerThread(row.supportThread),
    customerNote: row.customerNote,
    createdAt: row.createdAt.toISOString(),
  }
}
