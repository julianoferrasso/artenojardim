import {
  canCancelOrder,
  deriveSituation,
  supportTopicSchema,
  type CustomerSupportThread,
  type PaginationMeta,
  type SupportReplyData,
  type SupportStatusInput,
  type SupportSummary,
  type SupportThread,
  type SupportThreadListItem,
  type SupportThreadListQuery,
  type SupportTopic,
} from '@ecommerce/shared/contracts'
import { EVENTS, type SupportAuthor } from '@ecommerce/shared/constants'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { notFound } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit, type AuditContext } from '../../shared/audit.js'
import { toPrismaPagination, buildMeta } from '../../shared/pagination.js'
import { notifySupportReply } from '../notifications/service.js'
import { threadUpdateAfterMessage, threadUpdateForStatus } from './domain/thread.js'

/**
 * Atendimento: a conversa entre cliente e loja, uma por pedido.
 *
 * `appendMessage` é a única porta de escrita de mensagem — o cliente escrevendo,
 * a loja respondendo, o sistema registrando "cancelamento aprovado". Ela não
 * manda e-mail: quem chama sabe se o aviso vai para o cliente ou para a equipe,
 * e o envio só pode acontecer depois do commit da transação de quem chama.
 */

// ── Escrita ──────────────────────────────────────────────────────────────────

type NewMessage = {
  author: SupportAuthor
  userId?: string | null | undefined
  topic?: SupportTopic | null | undefined
  body: string
}

const addMessage = async (tx: Prisma.TransactionClient, threadId: string, msg: NewMessage, now: Date) => {
  await tx.supportMessage.create({
    data: {
      threadId,
      author: msg.author,
      userId: msg.userId ?? null,
      topic: msg.topic ?? null,
      body: msg.body,
      createdAt: now,
    },
  })
}

/**
 * Grava a mensagem na conversa do pedido, criando a conversa na primeira vez.
 * `upsert` pelo `orderId` único: duas mensagens simultâneas do mesmo pedido caem
 * na MESMA conversa (ON CONFLICT no banco), em vez de abrir duas.
 *
 * Quem chama já verificou que o pedido é desta loja e deste cliente.
 */
export const appendMessage = async (
  tx: Prisma.TransactionClient,
  input: { orderId: string; customerId: string } & NewMessage,
): Promise<{ threadId: string }> => {
  const now = new Date()
  const update = threadUpdateAfterMessage(input.author, now)

  const thread = await tx.supportThread.upsert({
    where: { orderId: input.orderId },
    create: { storeId: getActiveStoreId(), customerId: input.customerId, orderId: input.orderId, ...update },
    update,
    select: { id: true },
  })

  await addMessage(tx, thread.id, input, now)
  return { threadId: thread.id }
}

// ── Leitura: cliente ─────────────────────────────────────────────────────────

/** Para o `select` do pedido do cliente: a conversa vem junto, numa query só. */
export const CUSTOMER_THREAD_SELECT = {
  status: true,
  messages: {
    orderBy: { createdAt: 'asc' },
    // SEM userId: para o cliente, quem responde é a loja.
    select: { id: true, author: true, topic: true, body: true, createdAt: true },
  },
} satisfies Prisma.SupportThreadSelect

type CustomerThreadRow = Prisma.SupportThreadGetPayload<{ select: typeof CUSTOMER_THREAD_SELECT }>

const parseTopic = (topic: string | null): SupportTopic | null => {
  const parsed = supportTopicSchema.safeParse(topic)
  return parsed.success ? parsed.data : null
}

export const toCustomerThread = (row: CustomerThreadRow | null): CustomerSupportThread | null =>
  row
    ? {
        status: row.status,
        messages: row.messages.map((m) => ({
          id: m.id,
          author: m.author,
          topic: parseTopic(m.topic),
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        })),
      }
    : null

// ── Leitura: admin ───────────────────────────────────────────────────────────

const pendingCancelRequest = { cancelRequestedAt: { not: null }, canceledAt: null } satisfies Prisma.OrderWhereInput

const buildWhere = (q: SupportThreadListQuery): Prisma.SupportThreadWhereInput => {
  const where: Prisma.SupportThreadWhereInput = { storeId: getActiveStoreId() }

  switch (q.view) {
    case 'OPEN':
    case 'ANSWERED':
    case 'CLOSED':
      where.status = q.view
      break
    case 'CANCEL_REQUESTS':
      where.order = pendingCancelRequest
      break
    case 'ALL':
      break
  }

  if (q.q) {
    const digits = q.q.replace(/^#/, '')
    if (/^\d+$/.test(digits) && Number.isSafeInteger(Number(digits))) {
      where.order = { ...(where.order as Prisma.OrderWhereInput | undefined), number: Number(digits) }
    } else {
      where.customer = {
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { email: { contains: q.q, mode: 'insensitive' } },
        ],
      }
    }
  }

  return where
}

const LIST_SELECT = {
  id: true,
  status: true,
  lastMessageAt: true,
  lastCustomerMessageAt: true,
  customer: { select: { name: true, email: true } },
  order: { select: { id: true, number: true, cancelRequestedAt: true, canceledAt: true } },
  messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { author: true, topic: true, body: true } },
} satisfies Prisma.SupportThreadSelect

export const listThreads = async (
  q: SupportThreadListQuery,
): Promise<{ items: SupportThreadListItem[]; meta: PaginationMeta }> => {
  const where = buildWhere(q)
  // "Aguardando resposta" é uma FILA: quem espera há mais tempo vem primeiro.
  const orderBy: Prisma.SupportThreadOrderByWithRelationInput =
    q.view === 'OPEN' ? { lastCustomerMessageAt: { sort: 'asc', nulls: 'last' } } : { lastMessageAt: 'desc' }

  const [rows, total] = await Promise.all([
    prisma.supportThread.findMany({ where, select: LIST_SELECT, orderBy, ...toPrismaPagination(q) }),
    prisma.supportThread.count({ where }),
  ])

  const items = rows.map((r): SupportThreadListItem => {
    const last = r.messages[0]
    return {
      id: r.id,
      status: r.status,
      customerName: r.customer.name,
      customerEmail: r.customer.email,
      orderId: r.order?.id ?? null,
      orderNumber: r.order?.number ?? null,
      cancelRequested: !!r.order?.cancelRequestedAt && !r.order.canceledAt,
      lastMessageAt: r.lastMessageAt.toISOString(),
      lastCustomerMessageAt: r.lastCustomerMessageAt?.toISOString() ?? null,
      preview: last ? { author: last.author, topic: parseTopic(last.topic), body: last.body.slice(0, 200) } : null,
    }
  })

  return { items, meta: buildMeta(q, total) }
}

const THREAD_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  lastMessageAt: true,
  closedAt: true,
  orderId: true,
  customer: { select: { id: true, name: true, email: true } },
  order: {
    select: {
      id: true,
      number: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      productionDays: true,
      canceledAt: true,
      cancelRequestedAt: true,
      cancelRequestReason: true,
      total: true,
      createdAt: true,
      payments: {
        orderBy: { createdAt: 'desc' },
        select: { status: true, method: true, amount: true, refundedAmount: true },
      },
    },
  },
  messages: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, author: true, userId: true, topic: true, body: true, createdAt: true },
  },
} satisfies Prisma.SupportThreadSelect

type ThreadRow = Prisma.SupportThreadGetPayload<{ select: typeof THREAD_SELECT }>

const findThreadOrThrow = async (id: string): Promise<ThreadRow> => {
  const row = await prisma.supportThread.findFirst({ where: { id, storeId: getActiveStoreId() }, select: THREAD_SELECT })
  if (!row) throw notFound('Conversa')
  return row
}

/** `SupportMessage.userId` não tem relação com User — o nome vem de uma segunda query. */
const loadUserNames = async (row: ThreadRow): Promise<Map<string, string>> => {
  const ids = [...new Set(row.messages.map((m) => m.userId).filter((id): id is string => !!id))]
  if (ids.length === 0) return new Map()
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  return new Map(users.map((u) => [u.id, u.name]))
}

const toThreadDTO = (row: ThreadRow, names: Map<string, string>): SupportThread => {
  const order = row.order
  const paid = order?.payments.find((p) => p.status === 'PAID' || p.status === 'PARTIALLY_REFUNDED')

  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    lastMessageAt: row.lastMessageAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    customer: row.customer,
    order: order
      ? {
          id: order.id,
          number: order.number,
          situation: deriveSituation(order),
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          paymentMethod: (paid ?? order.payments[0])?.method ?? null,
          total: order.total,
          createdAt: order.createdAt.toISOString(),
          canceledAt: order.canceledAt?.toISOString() ?? null,
          cancelRequest:
            order.cancelRequestedAt && !order.canceledAt
              ? { requestedAt: order.cancelRequestedAt.toISOString(), reason: order.cancelRequestReason }
              : null,
          refundableAmount: paid ? paid.amount - paid.refundedAmount : 0,
          canCancel: canCancelOrder(order),
        }
      : null,
    messages: row.messages.map((m) => ({
      id: m.id,
      author: m.author,
      authorName: m.userId ? (names.get(m.userId) ?? null) : null,
      topic: parseTopic(m.topic),
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}

export const getThread = async (id: string): Promise<SupportThread> => {
  const row = await findThreadOrThrow(id)
  return toThreadDTO(row, await loadUserNames(row))
}

export const getSummary = async (): Promise<SupportSummary> => {
  const storeId = getActiveStoreId()
  const [awaitingReply, cancelRequests, needsAction] = await Promise.all([
    prisma.supportThread.count({ where: { storeId, status: 'OPEN' } }),
    prisma.order.count({ where: { storeId, ...pendingCancelRequest } }),
    prisma.supportThread.count({
      where: { storeId, OR: [{ status: 'OPEN' }, { order: pendingCancelRequest }] },
    }),
  ])
  return { awaitingReply, cancelRequests, needsAction }
}

// ── Ações da loja ────────────────────────────────────────────────────────────

export const replyToThread = async (
  id: string,
  input: SupportReplyData,
  ctx: AuditContext,
): Promise<SupportThread> => {
  const thread = await findThreadOrThrow(id)
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await addMessage(tx, id, { author: 'STAFF', userId: ctx.userId ?? null, body: input.body }, now)
    const update = input.close
      ? { ...threadUpdateAfterMessage('STAFF', now), ...threadUpdateForStatus('CLOSED', now) }
      : threadUpdateAfterMessage('STAFF', now)
    await tx.supportThread.update({ where: { id }, data: update })
  })

  // Fora da transação: auditoria que falha não desfaz a resposta.
  await audit({
    action: EVENTS.support.replied,
    entityType: 'SupportThread',
    entityId: id,
    changes: { status: { from: thread.status, to: input.close ? 'CLOSED' : 'ANSWERED' } },
    context: ctx,
  })

  if (thread.orderId) await notifySupportReply(thread.orderId, { body: input.body, kind: 'reply' })

  return getThread(id)
}

export const setThreadStatus = async (
  id: string,
  input: SupportStatusInput,
  ctx: AuditContext,
): Promise<SupportThread> => {
  const thread = await findThreadOrThrow(id)
  if (thread.status === input.status) return getThread(id)

  await prisma.supportThread.update({ where: { id }, data: threadUpdateForStatus(input.status, new Date()) })

  await audit({
    action: EVENTS.support.statusChanged,
    entityType: 'SupportThread',
    entityId: id,
    changes: { status: { from: thread.status, to: input.status } },
    context: ctx,
  })

  return getThread(id)
}
