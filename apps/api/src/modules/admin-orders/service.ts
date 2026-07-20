import {
  ERROR_CODES,
  canTransitionFulfillment,
  canCancelOrder,
  situationFilter,
  type AdminOrder,
  type AdminOrderListItem,
  type AdminOrderListQuery,
  type UpdateFulfillmentInput,
  type CancelOrderInput,
  type RefundOrderInput,
  type InternalNoteInput,
  type AddOrderEventData,
  type PaginationMeta,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { Prisma, type $Enums } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { notFound, conflict, businessError } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit, type AuditContext } from '../../shared/audit.js'
import { createRefund } from '../../integrations/stripe/index.js'
import { releaseOrderReservations, restockCanceledOrder } from '../inventory/service.js'
import {
  ADMIN_LIST_SELECT,
  ADMIN_ORDER_SELECT,
  toAdminListItem,
  toAdminOrderDTO,
  paidPayment,
  type AdminOrderRow,
} from './repository.js'

/**
 * Pedidos sob a ótica do staff: listar, abrir, mover na expedição, cancelar,
 * reembolsar e anotar.
 *
 * O que este módulo NÃO faz, e é o ponto: escrever `paymentStatus`. Nenhuma
 * função aqui toca nesse campo. Pagar é fato do Stripe, registrado pelo webhook
 * (regra 6). O reembolso é a exceção aparente — mas mesmo ele só PEDE ao Stripe;
 * quem grava o status é o `charge.refunded`.
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
 */
const dayRange = (from?: string, to?: string): Prisma.DateTimeFilter | undefined => {
  const filter: Prisma.DateTimeFilter = {}
  if (from) filter.gte = new Date(`${from}T00:00:00.000Z`)
  if (to) filter.lte = new Date(`${to}T23:59:59.999Z`)
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
 * NÃO devolve dinheiro. Reembolsar é ação separada e auditada à parte, porque
 * cancelar um pedido não pago (o caso comum) não tem nada a estornar.
 */
export type CancelActor = { kind: 'staff'; userId?: string | undefined } | { kind: 'customer' }

/**
 * A mecânica do cancelamento, sem auditoria e sem recarregar o DTO.
 *
 * Existe separada porque o cliente também cancela, pela área da conta, e
 * reimplementar a devolução de estoque em dois lugares é como se perde a conta
 * do que voltou para a prateleira. Quem chama decide o que auditar e o que
 * devolver.
 */
export const cancelOrderInternal = async (
  id: string,
  reason: string,
  actor: CancelActor,
): Promise<void> => {
  const order = await findOrThrow(id)

  if (order.canceledAt) throw conflict('Pedido já cancelado.', ERROR_CODES.ORDER_NOT_CANCELABLE)
  if (!canCancelOrder(order)) {
    throw conflict(
      'Pedido já saiu para envio — o caminho é registrar devolução, não cancelar.',
      ERROR_CODES.ORDER_NOT_CANCELABLE,
    )
  }

  const storeId = getActiveStoreId()
  const wasPaid = order.paymentStatus === 'PAID' || order.paymentStatus === 'PARTIALLY_REFUNDED'
  const userId = actor.kind === 'staff' ? (actor.userId ?? null) : null

  await prisma.$transaction(async (tx) => {
    // updateMany com `canceledAt: null` no where, e não update: entre o
    // findOrThrow acima e esta linha cabe um segundo clique, e cancelar duas
    // vezes reestocaria duas vezes o mesmo pedido.
    const claimed = await tx.order.updateMany({
      where: { id, canceledAt: null },
      data: { canceledAt: new Date(), cancelReason: reason },
    })
    if (claimed.count === 0) {
      throw conflict('Pedido já cancelado.', ERROR_CODES.ORDER_NOT_CANCELABLE)
    }

    if (wasPaid) await restockCanceledOrder(tx, storeId, id, userId ?? undefined)
    else await releaseOrderReservations(tx, id)

    await tx.orderEvent.create({
      data: {
        orderId: id,
        type: EVENTS.order.canceled,
        description: `Pedido cancelado: ${reason}`,
        metadataJson: {
          restocked: wasPaid,
          paymentStatus: order.paymentStatus,
          by: actor.kind,
        },
        userId,
      },
    })
  })
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

// ── Reembolso ────────────────────────────────────────────────────────────────

/**
 * Pede o reembolso ao Stripe e registra o PEDIDO na timeline — nada mais. O
 * status do pagamento (REFUNDED/PARTIALLY_REFUNDED) e o `refundedAmount` são
 * escritos pelo webhook `charge.refunded`, quando o dinheiro efetivamente sai.
 *
 * Gravar aqui seria mais rápido e estaria errado na hora em que o Stripe
 * recusasse: o pedido diria "reembolsado" com o dinheiro ainda no caixa.
 */
export const refundOrder = async (
  id: string,
  input: RefundOrderInput,
  ctx: AuditContext,
): Promise<AdminOrder> => {
  const order = await findOrThrow(id)
  const payment = paidPayment(order)

  if (!payment) {
    throw businessError(ERROR_CODES.VALIDATION_ERROR, 'Este pedido não tem pagamento confirmado para reembolsar.', 422)
  }

  const refundable = payment.amount - payment.refundedAmount
  if (refundable <= 0) throw conflict('Este pagamento já foi totalmente reembolsado.')

  const amount = input.amount ?? refundable
  if (amount > refundable) {
    throw businessError(
      ERROR_CODES.VALIDATION_ERROR,
      `Valor acima do saldo reembolsável (${(refundable / 100).toFixed(2)}).`,
      422,
    )
  }

  const refund = await createRefund({
    paymentIntentId: payment.stripePaymentIntentId,
    amountCents: amount,
    reason: input.reason,
    // Inclui o já reembolsado: dois parciais iguais e legítimos precisam ser
    // dois refunds, mas um clique duplo no mesmo estado precisa ser um só.
    idempotencyKey: `refund_${id}_${payment.refundedAmount}_${amount}`,
  })

  await prisma.orderEvent.create({
    data: {
      orderId: id,
      type: EVENTS.order.refundRequested,
      description: `Reembolso de R$ ${(amount / 100).toFixed(2)} solicitado ao Stripe`,
      metadataJson: { refundId: refund.id, amount, reason: input.reason, status: refund.status },
      userId: ctx.userId ?? null,
    },
  })

  await audit({
    action: EVENTS.order.refundRequested,
    entityType: 'Order',
    entityId: id,
    changes: { refundAmount: { from: null, to: amount } },
    context: ctx,
  })

  logger.info({ orderId: id, refundId: refund.id, amount }, 'reembolso solicitado ao Stripe')

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
