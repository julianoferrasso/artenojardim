import { EVENTS, type PaymentMethod } from '@ecommerce/shared/constants'
import type { SupportTopic } from '@ecommerce/shared/contracts'
import { prisma } from '../../config/prisma.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { publish } from '../../shared/publish.js'
import { getSetting } from '../../shared/settings.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import type { NoticeContent } from '../../integrations/email/index.js'
import type { AutoRefundOutcome } from '../payments/domain/refund.js'
import { raiseAlert, type AlertContent, type AlertTypes } from '../alerts/service.js'
import {
  customerCanceledNotice,
  customerCancelRequestNotice,
  customerRefundedNotice,
  customerReplyNotice,
  staffCanceledNotice,
  staffCancelRequestNotice,
  staffLowStockNotice,
  staffMessageNotice,
  staffOrderCreatedNotice,
  staffOrderPaidNotice,
  staffRefundFailedNotice,
  staffShippingDisconnectedNotice,
  staffSiteDownNotice,
  staffSiteUpNotice,
  type LowStockItem,
  type NoticeOrder,
  type OrderSummary,
  type SiteTargetStatus,
} from './domain/notices.js'
import { lowStockCrossing } from './domain/low-stock.js'

/**
 * Avisos que nascem de um fato do pedido, do atendimento, do estoque ou do
 * próprio servidor: ao cliente por e-mail; à equipe como ALERTA (e-mail, Telegram
 * ou WhatsApp, para quem assinou o tipo na tela de Alertas).
 *
 * Todo `notify*` roda DEPOIS do commit de quem chama e NUNCA lança: o fato já
 * aconteceu (o pedido foi cancelado, a mensagem foi gravada), e um RabbitMQ fora
 * do ar não pode transformar isso num erro para o cliente. A falha vira log.
 *
 * Vai pela fila e não direto ao provedor: a fila dá retry com DLQ visível, e o
 * cancelamento do cliente já espera uma ou duas chamadas ao Mercado Pago — somar
 * o envio à mesma requisição só a deixaria mais lenta.
 */

const storeUrl = (path: string): string => `${env.STORE_URL.replace(/\/$/, '')}${path}`
const adminUrl = (path: string): string => `${env.ADMIN_URL.replace(/\/$/, '')}${path}`

const orderPageUrl = (orderId: string): string => storeUrl(`/conta/pedidos/${orderId}`)
const conversationUrl = (orderId: string): string => `${orderPageUrl(orderId)}#conversa`
const adminOrderUrl = (orderId: string): string => adminUrl(`/pedidos/${orderId}`)
const adminThreadUrl = (threadId: string): string => adminUrl(`/atendimento/${threadId}`)
const adminStockUrl = (): string => adminUrl('/estoque')
const adminShippingUrl = (): string => adminUrl('/frete')

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
    logger.error({ err, ...ctx }, `falha ao enfileirar aviso: ${label}`)
  }
}

const toCustomer = async (order: LoadedOrder, data: NoticeContent): Promise<void> => {
  if (order.customerEmail) await enqueue(order.customerEmail, data)
}

/** A equipe recebe pelos destinos da tela de Alertas que assinam algum dos tipos. */
const toStaff = (types: AlertTypes, data: AlertContent): Promise<void> => raiseAlert(types, data)

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

    // Estorno recusado é o que pede ação: vai como REFUND_FAILED, e também a quem
    // assina só "cancelado pelo cliente" — o mesmo aviso, uma vez só.
    const types: AlertTypes | null =
      p.refund.status === 'failed'
        ? p.by === 'customer'
          ? ['REFUND_FAILED', 'ORDER_CANCELED_BY_CUSTOMER']
          : ['REFUND_FAILED']
        : p.by === 'customer'
          ? ['ORDER_CANCELED_BY_CUSTOMER']
          : null
    if (types) {
      await toStaff(
        types,
        staffCanceledNotice({ order, reason: p.reason, refund: p.refund, orderUrl: adminOrderUrl(orderId) }),
      )
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
      ['CANCELLATION_REQUESTED'],
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
    await toStaff(['REFUND_FAILED'], staffRefundFailedNotice({ order, amount: p.amount, orderUrl: adminOrderUrl(orderId) }))
  })

// ── Atendimento ──────────────────────────────────────────────────────────────

export const notifySupportMessage = (
  orderId: string,
  p: { threadId: string; topic: SupportTopic | null; body: string },
): Promise<void> =>
  safely('mensagem do cliente', { orderId, threadId: p.threadId }, async () => {
    const order = await loadOrder(orderId)
    if (!order) return
    await toStaff(
      ['CUSTOMER_MESSAGE'],
      staffMessageNotice({ order, topic: p.topic, body: p.body, threadUrl: adminThreadUrl(p.threadId) }),
    )
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

// ── Pedidos ──────────────────────────────────────────────────────────────────

type ShippingSnapshot = { carrier?: string; service?: string }
type AddressSnapshot = { city?: string; state?: string }

const shippingLine = (method: unknown, address: unknown): string | null => {
  const m = (method ?? {}) as ShippingSnapshot
  const a = (address ?? {}) as AddressSnapshot
  const service = [m.carrier, m.service].filter(Boolean).join(' ')
  const place = [a.city, a.state].filter(Boolean).join('/')
  return [service, place].filter(Boolean).join(' — ') || null
}

const loadOrderSummary = async (orderId: string): Promise<OrderSummary | null> => {
  const row = await prisma.order.findFirst({
    where: { id: orderId, storeId: getActiveStoreId() },
    select: {
      number: true,
      total: true,
      couponCodeSnapshot: true,
      shippingAddressJson: true,
      shippingMethodJson: true,
      customer: { select: { name: true } },
      items: { orderBy: { id: 'asc' }, select: { productName: true, variantName: true, quantity: true } },
      payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { method: true } },
    },
  })
  if (!row) return null
  return {
    number: row.number,
    customerName: row.customer.name,
    total: row.total,
    method: row.payments[0]?.method ?? null,
    items: row.items.map((item) => ({
      // '—' é o rótulo de variante única no snapshot: não acrescenta nada.
      label:
        item.variantName && item.variantName !== '—' ? `${item.productName} (${item.variantName})` : item.productName,
      quantity: item.quantity,
    })),
    shipping: shippingLine(row.shippingMethodJson, row.shippingAddressJson),
    couponCode: row.couponCodeSnapshot,
  }
}

/** Pagamento confirmado — chamado pelo orquestrador do `order.paid`, depois da confirmação ao cliente. */
export const notifyOrderPaid = (orderId: string): Promise<void> =>
  safely('pedido pago', { orderId }, async () => {
    const order = await loadOrderSummary(orderId)
    if (!order) return
    await toStaff(['ORDER_PAID'], staffOrderPaidNotice({ order, orderUrl: adminOrderUrl(orderId) }))
  })

/** Pedido criado, ainda sem pagamento. Nasce desligado na tela de Alertas. */
export const notifyOrderCreated = (orderId: string): Promise<void> =>
  safely('pedido criado', { orderId }, async () => {
    const order = await loadOrderSummary(orderId)
    if (!order) return
    await toStaff(['ORDER_CREATED'], staffOrderCreatedNotice({ order, orderUrl: adminOrderUrl(orderId) }))
  })

// ── Estoque ──────────────────────────────────────────────────────────────────

/** Uma variante cujo disponível acabou de cair. `onHand`/`reserved` são os de DEPOIS. */
export type StockChange = { variantId: string; before: number; onHand: number; reserved: number }

/**
 * Quem baixa estoque (a reserva do checkout, o ajuste do admin) passa o antes e o
 * depois; o limite é lido aqui, e só o que CRUZOU vira alerta. O nome dos
 * produtos só é buscado quando há o que avisar.
 */
export const notifyStockChanges = (changes: StockChange[]): Promise<void> =>
  safely('estoque baixo', { variants: changes.map((c) => c.variantId) }, async () => {
    if (changes.length === 0) return
    const { lowStockThreshold } = await getSetting('alerts')
    const crossed = changes.filter(
      (c) =>
        lowStockCrossing({ before: c.before, after: c.onHand - c.reserved, threshold: lowStockThreshold }) !== null,
    )
    if (crossed.length === 0) return

    const variants = await prisma.productVariant.findMany({
      where: { id: { in: crossed.map((c) => c.variantId) }, storeId: getActiveStoreId() },
      select: {
        id: true,
        sku: true,
        product: { select: { name: true } },
        optionValues: { select: { optionValue: { select: { value: true } } } },
      },
    })
    const byId = new Map(variants.map((v) => [v.id, v]))

    const items: LowStockItem[] = crossed.flatMap((c) => {
      const variant = byId.get(c.variantId)
      if (!variant) return []
      const label = variant.optionValues.map((o) => o.optionValue.value).join(' / ')
      return [
        {
          productName: variant.product.name,
          variantLabel: label || null,
          sku: variant.sku,
          onHand: c.onHand,
          reserved: c.reserved,
        },
      ]
    })
    if (items.length === 0) return

    await toStaff(
      ['LOW_STOCK'],
      staffLowStockNotice({ items, threshold: lowStockThreshold, stockUrl: adminStockUrl() }),
    )
  })

// ── Sistema ──────────────────────────────────────────────────────────────────

export const notifyShippingDisconnected = (): Promise<void> =>
  safely('frete desconectado', {}, async () => {
    await toStaff(['SHIPPING_DISCONNECTED'], staffShippingDisconnectedNotice({ shippingUrl: adminShippingUrl() }))
  })

export const notifySiteStatus = (
  p:
    | { kind: 'down'; targets: SiteTargetStatus[] }
    | { kind: 'up'; targets: { name: string; downMinutes: number }[] },
): Promise<void> =>
  safely('monitor da loja', { kind: p.kind }, async () => {
    await toStaff(
      ['SITE_DOWN'],
      p.kind === 'down'
        ? staffSiteDownNotice({ targets: p.targets, storeUrl: env.STORE_URL })
        : { ...staffSiteUpNotice({ targets: p.targets, storeUrl: env.STORE_URL }), emoji: '🟢' },
    )
  })
