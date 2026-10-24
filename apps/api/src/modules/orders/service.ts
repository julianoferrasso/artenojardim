import {
  situationFilter,
  periodStart,
  customerCancelMode,
  cancelReasonText,
  ERROR_CODES,
  type CustomerOrder,
  type CustomerOrderListItem,
  type CustomerOrderListQuery,
  type CustomerCancelInput,
  type SupportMessageInput,
  type ReorderResult,
  type OrderStatus,
  type PaginationMeta,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { logger } from '../../config/logger.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { notFound, conflict } from '../../shared/errors.js'
import { toPrismaPagination, buildMeta } from '../../shared/pagination.js'
import { cancelOrderInternal } from '../admin-orders/service.js'
import { refreshPendingMercadoPagoPayment, refundCanceledOrder } from '../payments/service.js'
import type { AutoRefundOutcome } from '../payments/domain/refund.js'
import { appendMessage } from '../support/service.js'
import { decideExpiry, EXPIRY_GRACE_MS } from './domain/expiry.js'
import {
  notifyCancelRequested,
  notifyOrderCanceled,
  notifySupportMessage,
} from '../notifications/service.js'
import { resolveCart, addItems } from '../cart/service.js'
import {
  CUSTOMER_LIST_SELECT,
  CUSTOMER_ORDER_SELECT,
  toCustomerListItem,
  toCustomerOrderDTO,
} from './repository.js'

/**
 * Pedidos na visão de quem comprou.
 *
 * A posse é SEMPRE pelo customerId — trocar o id na URL não alcança o pedido de
 * outro cliente (IDOR). `authenticateCustomer` responde "quem é você"; é aqui
 * que se responde "isto é seu". O pedido é snapshot: endereço e frete saem do
 * Json congelado no momento da compra, não do cadastro atual.
 */

const findOwnedOrThrow = async <T extends Prisma.OrderSelect>(
  customerId: string,
  id: string,
  select: T,
): Promise<Prisma.OrderGetPayload<{ select: T }>> => {
  const row = await prisma.order.findFirst({
    where: { id, customerId, storeId: getActiveStoreId() },
    select,
  })
  // 404 e não 403: dizer "existe, mas não é seu" já entrega que o pedido existe.
  if (!row) throw notFound('Pedido')
  return row as Prisma.OrderGetPayload<{ select: T }>
}

// ── Leitura ──────────────────────────────────────────────────────────────────

const parseSort = (sort: CustomerOrderListQuery['sort']): Prisma.OrderOrderByWithRelationInput => {
  const desc = sort.startsWith('-')
  const field = desc ? sort.slice(1) : sort
  const direction = desc ? 'desc' : 'asc'

  switch (field) {
    case 'total':
      return { total: direction }
    case 'number':
      return { number: direction }
    default:
      return { createdAt: direction }
  }
}

const buildWhere = (customerId: string, query: CustomerOrderListQuery): Prisma.OrderWhereInput => {
  const where: Prisma.OrderWhereInput = { customerId, storeId: getActiveStoreId() }

  if (query.situation) {
    // Via situationFilter, e não um where artesanal: é o que impede a lista
    // filtrada por "Enviado" mostrar um pedido cujo chip diz outra coisa.
    const filter = situationFilter(query.situation)
    if (filter.canceled === true) where.canceledAt = { not: null }
    if (filter.canceled === false) where.canceledAt = null
    if (filter.paymentStatus) where.paymentStatus = { in: [...filter.paymentStatus] }
    if (filter.fulfillmentStatus) where.fulfillmentStatus = { in: [...filter.fulfillmentStatus] }
    if (filter.madeToOrder === true) where.productionDays = { gt: 0 }
    if (filter.madeToOrder === false) where.productionDays = 0
  }

  const start = periodStart(query.period, new Date())
  if (start) where.createdAt = { gte: start }

  if (query.q) {
    // "#1042" e "1042" são a mesma busca — o cliente copia o número com o
    // cerquilha que a própria tela mostra.
    const digits = query.q.replace(/^#/, '')
    const asNumber = /^\d+$/.test(digits) ? Number(digits) : null

    if (asNumber !== null && Number.isSafeInteger(asNumber)) {
      where.number = asNumber
    } else {
      where.items = { some: { productName: { contains: query.q, mode: 'insensitive' } } }
    }
  }

  return where
}

export const listOrders = async (
  customerId: string,
  query: CustomerOrderListQuery,
): Promise<{ items: CustomerOrderListItem[]; meta: PaginationMeta }> => {
  const where = buildWhere(customerId, query)

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: CUSTOMER_LIST_SELECT,
      orderBy: parseSort(query.sort),
      ...toPrismaPagination(query),
    }),
    prisma.order.count({ where }),
  ])

  return { items: rows.map(toCustomerListItem), meta: buildMeta(query, total) }
}

export const getOrder = async (customerId: string, id: string): Promise<CustomerOrder> =>
  toCustomerOrderDTO(await findOwnedOrThrow(customerId, id, CUSTOMER_ORDER_SELECT))

export const getOrderStatus = async (customerId: string, id: string): Promise<OrderStatus> => {
  const select = { id: true, paymentStatus: true, fulfillmentStatus: true } as const
  const row = await findOwnedOrThrow(customerId, id, select)
  if (row.paymentStatus !== 'PENDING') return row

  // Polling da tela de pagamento: se o webhook do MP falhou ou atrasou, a
  // releitura confirma por aqui (mesma função única, regra 6).
  await refreshPendingMercadoPagoPayment(row.id)
  return findOwnedOrThrow(customerId, id, select)
}

// ── Cancelamento ─────────────────────────────────────────────────────────────

const CANCEL_STATE_SELECT = {
  id: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  productionDays: true,
  canceledAt: true,
  cancelRequestedAt: true,
  payments: {
    where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { amount: true, refundedAmount: true },
  },
} satisfies Prisma.OrderSelect

/**
 * Cancelado como "não pago", mas o Pix foi pago no meio do caminho: o MP recusou
 * cancelar a cobrança, a releitura aplicou o pagamento e o estorno já saiu por
 * `applyMercadoPagoOrder`. O e-mail do cancelamento precisa contar isso, e não
 * dizer "nada a estornar" a quem acabou de pagar.
 */
const refundFromLatePayment = async (orderId: string): Promise<AutoRefundOutcome> => {
  const paid = await prisma.payment.findFirst({
    where: { orderId, storeId: getActiveStoreId(), status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
    orderBy: { createdAt: 'desc' },
    select: { status: true, method: true, amount: true, refundedAmount: true },
  })
  if (!paid) return { status: 'none' }
  return paid.status === 'REFUNDED'
    ? { status: 'requested', amount: paid.refundedAmount, method: paid.method }
    : { status: 'failed', amount: Math.max(0, paid.amount - paid.refundedAmount), method: paid.method }
}

const notCancelable = (fulfillment: string): never => {
  const shipped = fulfillment === 'SHIPPED' || fulfillment === 'DELIVERED' || fulfillment === 'RETURNED'
  throw conflict(
    shipped
      ? 'Este pedido já foi enviado e não pode mais ser cancelado. Fale com a gente pela página do pedido sobre a devolução.'
      : 'Este pedido não pode mais ser cancelado. Fale com a gente pela página do pedido.',
    ERROR_CODES.ORDER_NOT_CANCELABLE,
  )
}

/**
 * Três saídas, decididas por `customerCancelMode` sobre o estado REAL:
 *
 * IMMEDIATE — ninguém começou a separar: cancela de verdade, reusando a
 * transação do admin (estoque e cupom voltam pelo mesmo caminho). Se estava
 * pago, o estorno total sai na hora, sem ninguém da loja precisar agir.
 *
 * REQUEST — a caixa já está sendo montada, ou a encomenda paga já está em
 * produção: registra o pedido de cancelamento (coluna + conversa) e avisa a
 * equipe, que aprova (e estorna) ou recusa.
 *
 * NONE — o pacote saiu: a conversa é o caminho (recusa na entrega, devolução).
 *
 * `paymentStatus` não é tocado aqui: só o estado que o provedor confirma
 * escreve pagamento (regra 6). O estorno é PEDIDO ao provedor.
 */
export const cancelOrder = async (
  customerId: string,
  id: string,
  input: CustomerCancelInput,
): Promise<CustomerOrder> => {
  let row = await findOwnedOrThrow(customerId, id, CANCEL_STATE_SELECT)

  // Pix pago há segundos com o webhook ainda a caminho: sem esta releitura o
  // pedido seria cancelado como "não pago", e o estorno dependeria do webhook
  // chegar depois. Relido, cai no ramo certo de primeira.
  if (row.paymentStatus === 'PENDING' || row.paymentStatus === 'PROCESSING') {
    await refreshPendingMercadoPagoPayment(id, { force: true })
    row = await findOwnedOrThrow(customerId, id, CANCEL_STATE_SELECT)
  }

  const mode = customerCancelMode(row)
  if (mode === 'NONE') return notCancelable(row.fulfillmentStatus)

  const reason = cancelReasonText(input)

  if (mode === 'IMMEDIATE') {
    const { paidAtCancel } = await cancelOrderInternal(
      id,
      reason,
      { kind: 'customer', reasonCode: input.reasonCode },
      { allowedFulfillments: ['UNFULFILLED'] },
    )
    const refund: AutoRefundOutcome = paidAtCancel
      ? await refundCanceledOrder(id, { kind: 'customer' })
      : await refundFromLatePayment(id)

    await notifyOrderCanceled(id, { by: 'customer', reason, refund })
    return getOrder(customerId, id)
  }

  if (row.cancelRequestedAt) {
    throw conflict(
      'Você já pediu o cancelamento deste pedido. Nossa equipe está analisando.',
      ERROR_CODES.CONFLICT,
    )
  }

  const claimed = await prisma.$transaction(async (tx) => {
    // As guardas no where: o staff pode ter despachado (ou outro clique pode ter
    // pedido) entre a leitura acima e esta linha.
    const result = await tx.order.updateMany({
      where: {
        id,
        canceledAt: null,
        cancelRequestedAt: null,
        OR: [
          { fulfillmentStatus: { in: ['PICKING', 'READY_TO_SHIP'] } },
          // Encomenda paga: a produção começou no pagamento (customerCancelMode).
          { fulfillmentStatus: 'UNFULFILLED', paymentStatus: 'PAID', productionDays: { gt: 0 } },
        ],
      },
      data: { cancelRequestedAt: new Date(), cancelRequestReason: reason },
    })
    if (result.count === 0) return false

    await tx.orderEvent.create({
      data: {
        orderId: id,
        type: EVENTS.order.cancelRequested,
        description: reason,
        metadataJson: { by: 'customer', reasonCode: input.reasonCode },
        userId: null,
      },
    })

    await appendMessage(tx, { orderId: id, customerId, author: 'CUSTOMER', topic: 'CANCELLATION', body: reason })
    return true
  })

  if (!claimed) {
    const fresh = await findOwnedOrThrow(customerId, id, CANCEL_STATE_SELECT)
    if (fresh.cancelRequestedAt) {
      throw conflict('Você já pediu o cancelamento deste pedido. Nossa equipe está analisando.', ERROR_CODES.CONFLICT)
    }
    return notCancelable(fresh.fulfillmentStatus)
  }

  const paid = row.payments[0]
  await notifyCancelRequested(id, {
    reason,
    refundAmount: paid ? Math.max(0, paid.amount - paid.refundedAmount) : 0,
    // REQUEST sem separação começada só existe para encomenda em produção.
    inProduction: row.fulfillmentStatus === 'UNFULFILLED',
  })

  return getOrder(customerId, id)
}

// ── Suporte ──────────────────────────────────────────────────────────────────

/**
 * A mensagem entra na conversa do pedido (criada na primeira vez) e a equipe é
 * avisada por e-mail. Antes, virava um evento na timeline que ninguém via.
 */
export const sendSupportMessage = async (
  customerId: string,
  id: string,
  input: SupportMessageInput,
): Promise<CustomerOrder> => {
  await findOwnedOrThrow(customerId, id, { id: true })

  const { threadId } = await prisma.$transaction((tx) =>
    appendMessage(tx, { orderId: id, customerId, author: 'CUSTOMER', topic: input.topic, body: input.message }),
  )

  await notifySupportMessage(id, { threadId, topic: input.topic, body: input.message })

  return getOrder(customerId, id)
}

// ── Comprar de novo ──────────────────────────────────────────────────────────

/**
 * Repõe no carrinho o que ainda dá para comprar, e reporta o que não dá.
 *
 * Falha parcial é o caso esperado — variante apagada, produto despublicado,
 * estoque menor que o comprado. Por isso não estoura no primeiro item
 * indisponível: o cliente prefere levar 4 dos 6 itens sabendo quais faltaram a
 * receber um erro e um carrinho vazio.
 */
export const reorder = async (customerId: string, id: string): Promise<ReorderResult> => {
  const row = await findOwnedOrThrow(customerId, id, {
    items: {
      orderBy: { id: 'asc' },
      select: { variantId: true, productName: true, quantity: true },
    },
  })

  const skipped: ReorderResult['skipped'] = []
  const wanted: { variantId: string; productName: string; quantity: number }[] = []

  for (const item of row.items) {
    if (!item.variantId) {
      // Variante apagada do catálogo (SetNull) — não há o que recomprar.
      skipped.push({
        productName: item.productName,
        reason: 'UNAVAILABLE',
        requested: item.quantity,
        added: 0,
      })
      continue
    }
    wanted.push({
      variantId: item.variantId,
      productName: item.productName,
      quantity: item.quantity,
    })
  }

  if (wanted.length === 0) return { added: [], skipped }

  // Cliente logado: o dono do carrinho é sempre o customerId, sem cookie de
  // sessão no meio — por isso a rota pode viver em `orders`.
  const { cartId } = await resolveCart({ customerId })
  const result = await addItems(cartId, wanted)

  return { added: result.added, skipped: [...skipped, ...result.skipped] }
}

// ── Expiração (job release-reservations) ─────────────────────────────────────

const EXPIRED_REASON = 'Pagamento não confirmado no prazo'

const EXPIRY_SELECT = {
  paymentStatus: true,
  paymentDueAt: true,
  payments: { select: { provider: true, method: true, status: true, expiresAt: true } },
} satisfies Prisma.OrderSelect

const loadForExpiry = (orderId: string) =>
  prisma.order.findFirst({
    where: { id: orderId, storeId: getActiveStoreId(), canceledAt: null },
    select: EXPIRY_SELECT,
  })

/** true = cancelado agora. */
const expireOrder = async (orderId: string, now: Date): Promise<boolean> => {
  let order = await loadForExpiry(orderId)
  if (!order) return false

  // Pix pago com o webhook perdido: sem a releitura, o job cancelaria — e o
  // estorno automático devolveria — uma venda de verdade.
  if (order.payments.some((p) => p.provider === 'MERCADO_PAGO' && p.status === 'PROCESSING')) {
    await refreshPendingMercadoPagoPayment(orderId, { force: true })
    order = await loadForExpiry(orderId)
    if (!order) return false
  }

  const { _max } = await prisma.inventoryReservation.aggregate({
    where: { orderId, releasedAt: null },
    _max: { expiresAt: true },
  })
  // Pedido só com encomenda não reserva nada: vence pelo prazo de pagamento.
  // Com reserva, é ela que manda — o Pix gerado estende a reserva, não o prazo.
  const deadline = _max.expiresAt ?? order.paymentDueAt
  if (!deadline) return false

  const decision = decideExpiry({
    paymentStatus: order.paymentStatus,
    latestReservationExpiry: deadline,
    attempts: order.payments,
    now,
  })
  if (decision.action === 'skip') return false

  await cancelOrderInternal(orderId, EXPIRED_REASON, { kind: 'system' })

  if (decision.notifyCustomer) {
    // Se o Pix foi pago no último segundo, o cancelamento da cobrança no MP
    // falhou, o pagamento foi aplicado e o estorno já saiu: o e-mail conta isso.
    await notifyOrderCanceled(orderId, {
      by: 'system',
      reason: EXPIRED_REASON,
      refund: await refundFromLatePayment(orderId),
    })
  }
  return true
}

/**
 * Cancela os pedidos não pagos cuja reserva venceu — o cancelamento devolve a
 * peça, o cupom e derruba o Pix em aberto. QUAIS pedidos é decisão de
 * `decideExpiry`; aqui é a varredura. Cada pedido é independente: um que mudou
 * de situação no meio (409) não para o lote.
 */
export const expireUnpaidOrders = async (now = new Date()): Promise<{ canceled: number; skipped: number }> => {
  const dueBefore = new Date(now.getTime() - EXPIRY_GRACE_MS)

  // A reserva não tem FK para o pedido: o escopo da loja vem do Order, no load.
  const due = await prisma.inventoryReservation.findMany({
    where: { releasedAt: null, expiresAt: { lt: dueBefore } },
    select: { orderId: true },
    distinct: ['orderId'],
  })

  // Segunda origem: o pedido só com encomenda, que não reservou nada. Sem isto
  // ele nunca venceria — e prenderia o cupom, "aguardando pagamento" para sempre.
  // `some: {}` porque `every` é verdadeiro para pedido sem item.
  const dueWithoutReservation = await prisma.order.findMany({
    where: {
      storeId: getActiveStoreId(),
      paymentStatus: 'PENDING',
      canceledAt: null,
      paymentDueAt: { lt: dueBefore },
      items: {
        some: {},
        every: { madeToOrderQuantity: { equals: prisma.orderItem.fields.quantity } },
      },
    },
    select: { id: true },
  })

  const orderIds = new Set([...due.map((d) => d.orderId), ...dueWithoutReservation.map((o) => o.id)])

  let canceled = 0
  let skipped = 0
  for (const orderId of orderIds) {
    try {
      if (await expireOrder(orderId, now)) canceled++
      else skipped++
    } catch (err) {
      skipped++
      logger.warn({ err, orderId }, 'expiração: pedido não cancelado nesta rodada')
    }
  }
  return { canceled, skipped }
}
