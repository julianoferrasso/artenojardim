import { EVENTS, type PaymentMethod } from '@ecommerce/shared/constants'
import type { SupportTopic } from '@ecommerce/shared/contracts'
import { prisma } from '../../config/prisma.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { publish } from '../../shared/publish.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import type { NoticeContent } from '../../integrations/email/index.js'
import type { AutoRefundOutcome } from '../payments/domain/refund.js'
import { getStaffNotificationEmail } from '../store/service.js'
import {
  customerCanceledNotice,
  customerCancelRequestNotice,
  customerRefundedNotice,
  customerReplyNotice,
  staffCanceledNotice,
  staffCancelRequestNotice,
  staffMessageNotice,
  staffRefundFailedNotice,
  staffTestNotice,
  type NoticeOrder,
} from './domain/notices.js'

/**
 * Avisos por e-mail que nascem de um fato do pedido ou do atendimento.
 *
 * Todo `notify*` roda DEPOIS do commit de quem chama e NUNCA lança: o fato já
 * aconteceu (o pedido foi cancelado, a mensagem foi gravada), e um RabbitMQ fora
 * do ar não pode transformar isso num erro para o cliente. A falha vira log.
 *
 * Vai pela fila e não direto ao SES: a fila dá retry com DLQ visível, e o
 * cancelamento do cliente já espera uma ou duas chamadas ao Mercado Pago — somar
 * o SES à mesma requisição só a deixaria mais lenta.
 */

const storeUrl = (path: string): string => `${env.STORE_URL.replace(/\/$/, '')}${path}`
const adminUrl = (path: string): string => `${env.ADMIN_URL.replace(/\/$/, '')}${path}`

const orderPageUrl = (orderId: string): string => storeUrl(`/conta/pedidos/${orderId}`)
const conversationUrl = (orderId: string): string => `${orderPageUrl(orderId)}#conversa`
const adminOrderUrl = (orderId: string): string => adminUrl(`/pedidos/${orderId}`)
const adminThreadUrl = (threadId: string): string => adminUrl(`/atendimento/${threadId}`)

type LoadedOrder = NoticeOrder & {
  id: string
  /** Null quando o cliente foi anonimizado (LGPD): não há a quem escrever. */
  customerEmail: string | null
  threadId: string | null
}

const loadOrder = async (orderId: string): Promise<LoadedOrder | null> => {
  const row = await prisma.order.findFirst({
    where: { id: orderId, storeId: getActiveStoreId() },
    select: {
      id: true,
      number: true,
      email: true,
      customer: { select: { name: true, deletedAt: true } },
      supportThread: { select: { id: true } },
    },
  })
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    customerName: row.customer.name,
    customerEmail: row.customer.deletedAt ? null : row.email,
    threadId: row.supportThread?.id ?? null,
  }
}

const enqueue = async (to: string, data: NoticeContent): Promise<void> => {
  await publish(EVENTS.email.notice, { template: 'notice', to, data })
}

/** Uma falha aqui é log, nunca erro: ver o comentário do módulo. */
const safely = async (label: string, ctx: Record<string, unknown>, fn: () => Promise<void>): Promise<void> => {
  try {
    await fn()
  } catch (err) {
    logger.error({ err, ...ctx }, `falha ao enfileirar aviso por e-mail: ${label}`)
  }
}

const toCustomer = async (order: LoadedOrder, data: NoticeContent): Promise<void> => {
  if (order.customerEmail) await enqueue(order.customerEmail, data)
}

const toStaff = async (data: NoticeContent): Promise<void> => enqueue(await getStaffNotificationEmail(), data)

// ── Cancelamento e estorno ───────────────────────────────────────────────────

/**
 * Pedido cancelado a pedido do cliente — direto por ele, ou aprovado pela loja.
 * A equipe só é avisada quando não foi ela que agiu, ou quando o estorno falhou.
 */
export const notifyOrderCanceled = (
  orderId: string,
  p: { by: 'customer' | 'store'; reason: string; refund: AutoRefundOutcome },
): Promise<void> =>
  safely('pedido cancelado', { orderId }, async () => {
    const order = await loadOrder(orderId)
    if (!order) return

    await toCustomer(order, customerCanceledNotice({ order, by: p.by, refund: p.refund, orderUrl: orderPageUrl(orderId) }))

    if (p.by === 'customer' || p.refund.status === 'failed') {
      await toStaff(staffCanceledNotice({ order, reason: p.reason, refund: p.refund, orderUrl: adminOrderUrl(orderId) }))
    }
  })

export const notifyCancelRequested = (
  orderId: string,
  p: { reason: string; refundAmount: number },
): Promise<void> =>
  safely('pedido de cancelamento', { orderId }, async () => {
    const order = await loadOrder(orderId)
    if (!order) return

    await toCustomer(
      order,
      customerCancelRequestNotice({ order, refundAmount: p.refundAmount, orderUrl: orderPageUrl(orderId) }),
    )
    await toStaff(
      staffCancelRequestNotice({
        order,
        reason: p.reason,
        threadUrl: order.threadId ? adminThreadUrl(order.threadId) : adminOrderUrl(orderId),
      }),
    )
  })

export const notifyOrderRefunded = (
  orderId: string,
  p: { amount: number; method: PaymentMethod | null },
): Promise<void> =>
  safely('estorno', { orderId }, async () => {
    const order = await loadOrder(orderId)
    if (!order) return
    await toCustomer(
      order,
      customerRefundedNotice({ order, amount: p.amount, method: p.method, orderUrl: orderPageUrl(orderId) }),
    )
  })

export const notifyRefundFailed = (orderId: string, p: { amount: number }): Promise<void> =>
  safely('estorno recusado', { orderId }, async () => {
    const order = await loadOrder(orderId)
    if (!order) return
    await toStaff(staffRefundFailedNotice({ order, amount: p.amount, orderUrl: adminOrderUrl(orderId) }))
  })

// ── Atendimento ──────────────────────────────────────────────────────────────

export const notifySupportMessage = (
  orderId: string,
  p: { threadId: string; topic: SupportTopic | null; body: string },
): Promise<void> =>
  safely('mensagem do cliente', { orderId, threadId: p.threadId }, async () => {
    const order = await loadOrder(orderId)
    if (!order) return
    await toStaff(staffMessageNotice({ order, topic: p.topic, body: p.body, threadUrl: adminThreadUrl(p.threadId) }))
  })

export const notifySupportReply = (
  orderId: string,
  p: { body: string; kind: 'reply' | 'cancel_declined' },
): Promise<void> =>
  safely('resposta da loja', { orderId }, async () => {
    const order = await loadOrder(orderId)
    if (!order) return
    await toCustomer(order, customerReplyNotice({ order, body: p.body, kind: p.kind, orderUrl: conversationUrl(orderId) }))
  })

/**
 * Envio de prova da tela de configurações. Este SIM lança: quem clicou em
 * "Enviar teste" precisa saber que a fila está fora, e não ver um sucesso falso.
 */
export const sendStaffTestNotice = async (): Promise<{ to: string }> => {
  const to = await getStaffNotificationEmail()
  await enqueue(to, staffTestNotice({ adminUrl: adminUrl('/') }))
  return { to }
}
