import {
  ERROR_CODES,
  CANCELABLE_FULFILLMENTS,
  canTransitionFulfillment,
  estimateProductionDue,
  situationFilter,
  type AdminOrder,
  type AdminOrderListItem,
  type AdminOrderListQuery,
  type UpdateFulfillmentInput,
  type CancelOrderInput,
  type CustomerCancelReason,
  type DeclineCancelRequestInput,
  type RefundOrderInput,
  type InternalNoteInput,
  type AddOrderEventData,
  type PaginationMeta,
  type ProductionSummary,
} from '@ecommerce/shared/contracts'
import { EVENTS, REFUND_TIMING_LABEL, type FulfillmentStatus } from '@ecommerce/shared/constants'
import { spDayStart, spDayEnd, spDayKey } from '@ecommerce/shared/utils'
import { Prisma, type $Enums } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { env } from '../../config/env.js'
import { notFound, conflict } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit, type AuditContext } from '../../shared/audit.js'
import { formatBRL } from '../../utils/money.js'
import { afterStockChange, releaseOrderReservations, restockCanceledOrder } from '../inventory/service.js'
import { releaseCouponUse } from '../coupons/service.js'
import {
  cancelPendingMercadoPagoPayments,
  refundCanceledOrder,
  refundOrderPayment,
} from '../payments/service.js'
import type { AutoRefundOutcome } from '../payments/domain/refund.js'
import { appendMessage } from '../support/service.js'
import {
  notifyOrderCanceled,
  notifyOrderRefunded,
  notifyProductionDue,
  notifySupportReply,
} from '../notifications/service.js'
import { alertRaisedSince } from '../alerts/service.js'
import { isProductionDigestTime, productionDeadlineState } from './domain/production.js'
import {
  ADMIN_LIST_SELECT,
  ADMIN_ORDER_SELECT,
  toAdminListItem,
  toAdminOrderDTO,
  type AdminOrderRow,
} from './repository.js'

/**
 * Pedidos sob a ótica do staff: listar, abrir, mover na expedição, cancelar,
 * reembolsar e anotar.
 *
 * O que este módulo NÃO faz, e é o ponto: escrever `paymentStatus`. Nenhuma
 * função aqui toca nesse campo. Pagar é fato do provedor, registrado pelo estado
 * que ele confirma ao servidor (regra 6). O reembolso é a exceção aparente — mas
 * mesmo ele só PEDE ao provedor; quem grava o status é o pagamento: o webhook
 * `charge.refunded` no Stripe, a order devolvida pelo Mercado Pago no MP.
 */

const FULFILLMENT_EVENT: Record<$Enums.FulfillmentStatus, string> = {
  UNFULFILLED: EVENTS.order.created,
  PICKING: EVENTS.order.picking,
  READY_TO_SHIP: EVENTS.order.readyToShip,
  SHIPPED: EVENTS.order.shipped,
  DELIVERED: EVENTS.order.delivered,
  RETURNED: EVENTS.order.returned,
}

const FULFILLMENT_LABEL: Record<$Enums.FulfillmentStatus, string> = {
  UNFULFILLED: 'Aguardando separação',
  PICKING: 'Em separação',
  READY_TO_SHIP: 'Pronto para envio',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  RETURNED: 'Devolvido',
}

/** O caminho do dashboard muda entre test e live; só a API sabe qual chave usa. */
const dashboardBase = (): string | null => {
  if (!env.STRIPE_SECRET) return null
  return env.STRIPE_SECRET.startsWith('sk_test_')
    ? 'https://dashboard.stripe.com/test'
    : 'https://dashboard.stripe.com'
}

/**
 * Nomes dos autores da timeline. OrderEvent.userId não tem relação com User (o
 * evento precisa sobreviver ao funcionário desligado), então o join é aqui.
 */
const loadUserNames = async (rows: AdminOrderRow[]): Promise<Map<string, string>> => {
  const ids = [...new Set(rows.flatMap((r) => r.events.map((e) => e.userId).filter((id): id is string => !!id)))]
  if (ids.length === 0) return new Map()
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  return new Map(users.map((u) => [u.id, u.name]))
}

const findOrThrow = async (id: string): Promise<AdminOrderRow> => {
  const row = await prisma.order.findFirst({
    where: { id, storeId: getActiveStoreId() },
    select: ADMIN_ORDER_SELECT,
  })
  if (!row) throw notFound('Pedido')
  return row
}

const toDTO = async (row: AdminOrderRow): Promise<AdminOrder> =>
  toAdminOrderDTO(row, { userNames: await loadUserNames([row]), dashboardBase: dashboardBase() })

/** Recarrega e serializa: toda escrita devolve o pedido inteiro atualizado. */
const reload = async (id: string): Promise<AdminOrder> => toDTO(await findOrThrow(id))

// ── Listagem ─────────────────────────────────────────────────────────────────

const SORTABLE = new Set(['createdAt', 'number', 'total'])

const parseSort = (sort?: string): Prisma.OrderOrderByWithRelationInput => {
  if (!sort) return { createdAt: 'desc' }
  const desc = sort.startsWith('-')
  const field = desc ? sort.slice(1) : sort
  if (!SORTABLE.has(field)) return { createdAt: 'desc' }
  return { [field]: desc ? 'desc' : 'asc' }
}

/**
 * `to` é INCLUSIVO para o operador: "até 19/07" tem que trazer o pedido das
 * 18h de 19/07. Sem o fim do dia, `lte: 2026-07-19T00:00` esconderia o dia todo.
 *
 * O dia é o BRASILEIRO. O `<input type="date">` entrega a data que o operador
 * escolheu no calendário dele; tratá-la como dia UTC (o `Z` que estava aqui)
 * fazia o filtro perder os pedidos feitos das 21h à meia-noite.
 */
const dayRange = (from?: string, to?: string): Prisma.DateTimeFilter | undefined => {
  const filter: Prisma.DateTimeFilter = {}
  if (from) filter.gte = spDayStart(from)
  if (to) filter.lte = spDayEnd(to)
  return from || to ? filter : undefined
}

const buildWhere = (q: AdminOrderListQuery): Prisma.OrderWhereInput => {
  const where: Prisma.OrderWhereInput = { storeId: getActiveStoreId() }

  if (q.situation) {
    const f = situationFilter(q.situation)
    if (f.canceled === true) where.canceledAt = { not: null }
    if (f.canceled === false) where.canceledAt = null
    if (f.paymentStatus) where.paymentStatus = { in: [...f.paymentStatus] }
    if (f.fulfillmentStatus) where.fulfillmentStatus = { in: [...f.fulfillmentStatus] }
    if (f.madeToOrder === true) where.productionDays = { gt: 0 }
    if (f.madeToOrder === false) where.productionDays = 0
  }

  if (q.customerId) where.customerId = q.customerId

  const createdAt = dayRange(q.from, q.to)
  if (createdAt) where.createdAt = createdAt

  if (q.q) {
    const term = q.q.trim()
    // "#1042" ou "1042" é busca por número — o jeito como o operador fala do
    // pedido. Qualquer outra coisa é e-mail ou nome.
    const asNumber = /^#?\d+$/.test(term) ? Number(term.replace('#', '')) : null
    if (asNumber !== null) {
      where.number = asNumber
    } else {
      where.OR = [
        { email: { contains: term, mode: 'insensitive' } },
        { customer: { name: { contains: term, mode: 'insensitive' } } },
      ]
    }
  }

  return where
}

export const listOrders = async (
  q: AdminOrderListQuery,
): Promise<{ items: AdminOrderListItem[]; meta: PaginationMeta }> => {
  const where = buildWhere(q)

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: ADMIN_LIST_SELECT,
      orderBy: parseSort(q.sort),
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
    }),
    prisma.order.count({ where }),
  ])

  return {
    items: rows.map(toAdminListItem),
    meta: {
      page: q.page,
      perPage: q.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.perPage)),
    },
  }
}

export const getOrder = async (id: string): Promise<AdminOrder> => reload(id)

// ── Produção ─────────────────────────────────────────────────────────────────

type QueuedOrder = { number: number; dueAt: Date }

/**
 * As encomendas que esperam a produção: pagas, sem separação começada e não
 * canceladas — a situação "Em produção". O prazo conta do primeiro pagamento
 * aprovado. Loja artesanal tem poucas: ordenar em memória é mais simples que
 * levar o calendário de dias úteis para o SQL.
 */
const productionQueue = async (): Promise<QueuedOrder[]> => {
  const rows = await prisma.order.findMany({
    where: {
      storeId: getActiveStoreId(),
      canceledAt: null,
      paymentStatus: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
      productionDays: { gt: 0 },
    },
    select: {
      number: true,
      productionDays: true,
      payments: { where: { paidAt: { not: null } }, orderBy: { paidAt: 'asc' }, take: 1, select: { paidAt: true } },
    },
  })
  return rows
    .flatMap((r) => {
      const due = estimateProductionDue({ paidAt: r.payments[0]?.paidAt ?? null, productionDays: r.productionDays })
      return due ? [{ number: r.number, dueAt: new Date(due) }] : []
    })
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
}

/** O item "Encomendas em produção" do Dashboard. */
export const getProductionSummary = async (now = new Date()): Promise<ProductionSummary> => {
  const queue = await productionQueue()
  const states = queue.map((o) => productionDeadlineState({ dueAt: o.dueAt, now }))
  return {
    inProduction: queue.length,
    dueSoon: states.filter((s) => s === 'DUE_SOON').length,
    overdue: states.filter((s) => s === 'OVERDUE').length,
  }
}

/**
 * O resumo diário para a equipe (job `production-deadlines`, de hora em hora):
 * sai uma vez por dia útil, a partir das 8h, e só se houver encomenda atrasada
 * ou vencendo até o próximo dia útil.
 */
export const sendProductionDigest = async (now = new Date()): Promise<void> => {
  if (!isProductionDigestTime(now)) return
  if (await alertRaisedSince('PRODUCTION_DUE', spDayStart(spDayKey(now)))) return

  const queue = await productionQueue()
  const overdue = queue.filter((o) => productionDeadlineState({ dueAt: o.dueAt, now }) === 'OVERDUE')
  const dueSoon = queue.filter((o) => productionDeadlineState({ dueAt: o.dueAt, now }) === 'DUE_SOON')
  await notifyProductionDue({ overdue, dueSoon })
}

// ── Expedição ────────────────────────────────────────────────────────────────

export const updateFulfillment = async (
  id: string,
  input: UpdateFulfillmentInput,
  ctx: AuditContext,
): Promise<AdminOrder> => {
  const order = await findOrThrow(id)
  const from = order.fulfillmentStatus
  const to = input.fulfillmentStatus

  if (from === to) return toDTO(order)

  if (!canTransitionFulfillment(from, to, { paymentStatus: order.paymentStatus, canceled: !!order.canceledAt })) {
    throw conflict(
      order.canceledAt
        ? 'Pedido cancelado não pode mudar de status.'
        : `Transição não permitida: ${FULFILLMENT_LABEL[from]} → ${FULFILLMENT_LABEL[to]}.`,
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: { fulfillmentStatus: to } })
    await tx.orderEvent.create({
      data: {
        orderId: id,
        type: FULFILLMENT_EVENT[to],
        description: input.note?.trim() || `Status alterado para ${FULFILLMENT_LABEL[to]}`,
        // Rastreio não tem coluna: viaja no metadata do evento de envio, que a
        // loja lê por convenção (ver contracts/order-attachments.ts).
        metadataJson: {
          from,
          to,
          ...(input.trackingCode?.trim() ? { trackingCode: input.trackingCode.trim() } : {}),
          ...(input.trackingUrl?.trim() ? { trackingUrl: input.trackingUrl.trim() } : {}),
        },
        userId: ctx.userId ?? null,
      },
    })
  })

  // Fora da transação: auditoria que falha não pode desfazer a operação.
  await audit({
    action: FULFILLMENT_EVENT[to],
    entityType: 'Order',
    entityId: id,
    changes: { fulfillmentStatus: { from, to } },
    context: ctx,
  })

  return reload(id)
}

// ── Cancelamento ─────────────────────────────────────────────────────────────

/**
 * Cancelar devolve a mercadoria à prateleira, e o caminho depende de onde o
 * estoque está:
 *   - pedido pago: as reservas já viraram SALE → CANCELLATION (+qty) no ledger
 *   - pedido não pago: as reservas estão vivas → basta liberá-las
 *
 * NÃO devolve dinheiro. Reembolsar é ação separada — quem cancela a pedido do
 * cliente (ele mesmo, ou a loja aprovando) chama `refundCanceledOrder` depois.
 */
export type CancelActor =
  | { kind: 'staff'; userId?: string | undefined; approvedRequest?: boolean }
  | { kind: 'customer'; reasonCode?: CustomerCancelReason }
  /** O job que cancela pedido não pago depois que a reserva vence. */
  | { kind: 'system' }

/**
 * A mecânica do cancelamento, sem auditoria e sem recarregar o DTO.
 *
 * Existe separada porque o cliente também cancela, pela área da conta, e
 * reimplementar a devolução de estoque em dois lugares é como se perde a conta
 * do que voltou para a prateleira. Quem chama decide o que auditar e o que
 * devolver.
 *
 * `allowedFulfillments` estreita onde se pode cancelar: o cliente só cancela
 * sozinho antes da separação, o staff até o despacho.
 *
 * Devolve se o pedido estava pago NO INSTANTE do cancelamento — é o que diz a
 * quem chama se há estorno a pedir.
 */
export const cancelOrderInternal = async (
  id: string,
  reason: string,
  actor: CancelActor,
  opts: { allowedFulfillments?: readonly FulfillmentStatus[] } = {},
): Promise<{ paidAtCancel: boolean }> => {
  const order = await findOrThrow(id)
  const allowed = opts.allowedFulfillments ?? CANCELABLE_FULFILLMENTS

  if (order.canceledAt) throw conflict('Pedido já cancelado.', ERROR_CODES.ORDER_NOT_CANCELABLE)
  if (!allowed.includes(order.fulfillmentStatus)) {
    throw conflict(
      'Pedido já saiu para envio — o caminho é registrar devolução, não cancelar.',
      ERROR_CODES.ORDER_NOT_CANCELABLE,
    )
  }

  const storeId = getActiveStoreId()
  const userId = actor.kind === 'staff' ? (actor.userId ?? null) : null

  const { paidAtCancel, stock } = await prisma.$transaction(async (tx) => {
    // updateMany com as guardas no where, e não update: entre o findOrThrow
    // acima e esta linha cabem um segundo clique e o staff mudando a expedição.
    // Cancelar duas vezes reestocaria duas vezes o mesmo pedido.
    const claimed = await tx.order.updateMany({
      where: {
        id,
        canceledAt: null,
        fulfillmentStatus: { in: [...allowed] },
        // O job só cancela o que segue NÃO pago. Um pagamento confirmado entre a
        // leitura dele e este claim seria cancelado como pago — peça de volta,
        // cupom de volta e nenhum estorno. Com a guarda, quem commita primeiro
        // vence: o pagamento (o claim falha) ou o job (o pagamento que chegar
        // depois cai no estorno automático de "pago com o pedido cancelado").
        ...(actor.kind === 'system' ? { paymentStatus: 'PENDING' as const } : {}),
      },
      data: { canceledAt: new Date(), cancelReason: reason },
    })
    if (claimed.count === 0) {
      throw conflict(
        'O pedido mudou de situação enquanto o cancelamento era feito. Atualize a página.',
        ERROR_CODES.ORDER_NOT_CANCELABLE,
      )
    }

    // O pagamento é relido DEPOIS do claim, dentro da transação: o claim trava
    // a linha do pedido, então o webhook que confirma o pagamento ou já gravou
    // (e o lemos aqui) ou espera este commit (e vê o pedido cancelado). Lido
    // antes, um pagamento no meio-tempo cancelava como "não pago": estoque
    // perdido e nenhum estorno.
    const fresh = await tx.order.findUniqueOrThrow({ where: { id }, select: { paymentStatus: true } })
    // REFUNDED conta como pago: o estorno devolve o dinheiro, não a peça. Quem a
    // devolve à prateleira é o cancelamento, venha ele antes ou depois do estorno.
    const wasPaid =
      fresh.paymentStatus === 'PAID' ||
      fresh.paymentStatus === 'PARTIALLY_REFUNDED' ||
      fresh.paymentStatus === 'REFUNDED'

    const stock = wasPaid
      ? await restockCanceledOrder(tx, storeId, id, userId ?? undefined)
      : await releaseOrderReservations(tx, id)

    // Pedido cancelado deixa de ser uso do cupom, pago ou não: a vaga volta.
    if (order.couponId) await releaseCouponUse(tx, order.couponId)

    await tx.orderEvent.create({
      data: {
        orderId: id,
        type: EVENTS.order.canceled,
        description: `Pedido cancelado: ${reason}`,
        metadataJson: {
          // Encomenda pura não tirou nada da prateleira: não há o que devolver.
          restocked: wasPaid && stock.length > 0,
          paymentStatus: fresh.paymentStatus,
          by: actor.kind,
          ...(actor.kind === 'customer' && actor.reasonCode ? { reasonCode: actor.reasonCode } : {}),
          ...(actor.kind === 'staff' && actor.approvedRequest ? { approvedRequest: true } : {}),
        },
        userId,
      },
    })

    // Só o que foi PAGO de fato tem o que estornar; REFUNDED já voltou.
    return {
      paidAtCancel: fresh.paymentStatus === 'PAID' || fresh.paymentStatus === 'PARTIALLY_REFUNDED',
      stock,
    }
  })

  // Fora da transação (é chamada externa) e depois do commit: o Pix em aberto
  // no Mercado Pago continuaria pagável para um pedido que não existe mais.
  // Roda mesmo com o pedido pago — só mexe em tentativas ainda em aberto.
  await cancelPendingMercadoPagoPayments(id)
  // A peça voltou: a vitrine deixa de mostrá-la esgotada.
  await afterStockChange(stock)

  return { paidAtCancel }
}

export const cancelOrder = async (
  id: string,
  input: CancelOrderInput,
  ctx: AuditContext,
): Promise<AdminOrder> => {
  await cancelOrderInternal(id, input.reason, { kind: 'staff', userId: ctx.userId })

  // Fora da transação: auditoria que falha não pode desfazer a operação.
  await audit({
    action: EVENTS.order.canceled,
    entityType: 'Order',
    entityId: id,
    changes: { canceledAt: { from: null, to: new Date().toISOString() }, cancelReason: { from: null, to: input.reason } },
    context: ctx,
  })

  return reload(id)
}

// ── Pedido de cancelamento do cliente ────────────────────────────────────────

const assertPendingRequest = (order: AdminOrderRow): void => {
  if (!order.cancelRequestedAt || order.canceledAt) {
    throw conflict('Não há pedido de cancelamento esperando decisão neste pedido.')
  }
}

const approvalMessage = (refund: AutoRefundOutcome): string => {
  if (refund.status === 'requested') {
    const timing = refund.method ? ` ${REFUND_TIMING_LABEL[refund.method]}` : ''
    return `Cancelamento aprovado. O estorno de ${formatBRL(refund.amount)} já foi solicitado.${timing}`
  }
  if (refund.status === 'failed') {
    return `Cancelamento aprovado. O estorno de ${formatBRL(refund.amount)} está em processamento — avisaremos por e-mail quando for concluído.`
  }
  return 'Cancelamento aprovado.'
}

/**
 * Aprovar = cancelar + estornar tudo, num clique. É o mesmo efeito do
 * cancelamento que o cliente faria sozinho antes da separação; a loja só
 * confirma que a caixa meio montada pode voltar para a prateleira.
 */
export const approveCancelRequest = async (id: string, ctx: AuditContext): Promise<AdminOrder> => {
  const order = await findOrThrow(id)
  assertPendingRequest(order)

  const reason = order.cancelRequestReason ?? 'Pedido de cancelamento do cliente'
  const { paidAtCancel } = await cancelOrderInternal(id, reason, {
    kind: 'staff',
    userId: ctx.userId,
    approvedRequest: true,
  })

  const refund: AutoRefundOutcome = paidAtCancel
    ? await refundCanceledOrder(id, { kind: 'staff', userId: ctx.userId })
    : { status: 'none' }

  await prisma.$transaction((tx) =>
    appendMessage(tx, {
      orderId: id,
      customerId: order.customer.id,
      author: 'SYSTEM',
      topic: 'CANCELLATION',
      body: approvalMessage(refund),
    }),
  )

  await audit({
    action: EVENTS.order.canceled,
    entityType: 'Order',
    entityId: id,
    changes: {
      canceledAt: { from: null, to: new Date().toISOString() },
      cancelRequest: { from: 'pending', to: 'approved' },
      refund: { from: null, to: refund.status },
    },
    context: ctx,
  })

  await notifyOrderCanceled(id, { by: 'store', reason, refund })

  return reload(id)
}

/**
 * Recusar devolve o pedido ao fluxo normal e explica por quê ao cliente — pela
 * conversa e por e-mail. A solicitação zera: se o pedido ainda estiver em
 * separação, o cliente pode pedir de novo.
 */
export const declineCancelRequest = async (
  id: string,
  input: DeclineCancelRequestInput,
  ctx: AuditContext,
): Promise<AdminOrder> => {
  const order = await findOrThrow(id)
  assertPendingRequest(order)

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id, cancelRequestedAt: { not: null }, canceledAt: null },
      data: { cancelRequestedAt: null, cancelRequestReason: null },
    })
    if (claimed.count === 0) throw conflict('Este pedido de cancelamento já foi decidido.')

    await tx.orderEvent.create({
      data: {
        orderId: id,
        type: EVENTS.order.cancelRequestDeclined,
        description: input.message,
        metadataJson: { by: 'staff' },
        userId: ctx.userId ?? null,
      },
    })

    await appendMessage(tx, {
      orderId: id,
      customerId: order.customer.id,
      author: 'STAFF',
      userId: ctx.userId ?? null,
      topic: 'CANCELLATION',
      body: input.message,
    })
  })

  await audit({
    action: EVENTS.order.cancelRequestDeclined,
    entityType: 'Order',
    entityId: id,
    changes: { cancelRequest: { from: 'pending', to: 'declined' } },
    context: ctx,
  })

  await notifySupportReply(id, { body: input.message, kind: 'cancel_declined' })

  return reload(id)
}

// ── Reembolso ────────────────────────────────────────────────────────────────

/**
 * Reembolso pedido pelo staff. A mecânica (provedor, idempotência, timeline)
 * mora em `payments`, porque o cancelamento do cliente e o pagamento que chega
 * depois do cancelamento também estornam — aqui ficam a auditoria e o aviso.
 */
export const refundOrder = async (
  id: string,
  input: RefundOrderInput,
  ctx: AuditContext,
): Promise<AdminOrder> => {
  await findOrThrow(id)

  const { amount, method } = await refundOrderPayment(
    id,
    { amount: input.amount, reason: input.reason },
    { kind: 'staff', userId: ctx.userId },
  )

  await audit({
    action: EVENTS.order.refundRequested,
    entityType: 'Order',
    entityId: id,
    changes: { refundAmount: { from: null, to: amount } },
    context: ctx,
  })

  await notifyOrderRefunded(id, { amount, method })

  return reload(id)
}

// ── Observações ──────────────────────────────────────────────────────────────

export const setInternalNote = async (
  id: string,
  input: InternalNoteInput,
  ctx: AuditContext,
): Promise<AdminOrder> => {
  const order = await findOrThrow(id)
  const note = input.internalNote.trim() || null

  if (note === order.internalNote) return toDTO(order)

  await prisma.order.update({ where: { id }, data: { internalNote: note } })

  await audit({
    action: EVENTS.order.noteAdded,
    entityType: 'Order',
    entityId: id,
    changes: { internalNote: { from: order.internalNote, to: note } },
    context: ctx,
  })

  return reload(id)
}

/**
 * Anotação avulsa na timeline — o que aconteceu e não cabe em nenhum status.
 *
 * `type` vem de um enum fechado (STAFF_EVENT_TYPES): nota interna, que a loja
 * esconde, ou "saiu para entrega", que ela mostra. O `metadata` é o único
 * caminho para rastreio e nota fiscal existirem enquanto não há coluna.
 */
export const addOrderEvent = async (
  id: string,
  input: AddOrderEventData,
  ctx: AuditContext,
): Promise<AdminOrder> => {
  await findOrThrow(id)

  const metadata: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    const trimmed = value?.trim()
    if (trimmed) metadata[key] = trimmed
  }

  await prisma.orderEvent.create({
    data: {
      orderId: id,
      type: input.type,
      description: input.description.trim(),
      // Só grava a chave se houver conteúdo: metadata vazio polui a timeline
      // e faria readOrderAttachments varrer objetos sem nada dentro.
      ...(Object.keys(metadata).length > 0 ? { metadataJson: metadata } : {}),
      userId: ctx.userId ?? null,
    },
  })

  return reload(id)
}
