import { z } from 'zod'
import { paymentMethodSchema, paymentStatusSchema } from '../constants/enums.js'
import type { PaymentStatus, FulfillmentStatus } from '../constants/enums.js'
import { EVENTS } from '../constants/events.js'
import { moneySchema } from './common.js'
import { orderItemSchema, orderSchema } from './orders.js'
import { orderSituationSchema } from './order-situation.js'

/**
 * Área do cliente > Meus pedidos.
 *
 * O que separa este arquivo de `admin-orders.ts` não é a tela — é a confiança.
 * O admin vê nota interna, nome do funcionário e id do Stripe; o cliente não vê
 * nada disso. Por isso a timeline aqui passa por uma WHITELIST: um tipo de
 * evento que ninguém decidiu mostrar simplesmente não chega ao cliente.
 */

// ---------------------------------------------------------------------------
// Filtros da listagem
// ---------------------------------------------------------------------------

export const ORDER_PERIODS = ['30d', '90d', '6m', '1y', 'all'] as const
export const orderPeriodSchema = z.enum(ORDER_PERIODS)
export type OrderPeriod = z.infer<typeof orderPeriodSchema>

/**
 * PURA: recebe `now` em vez de chamar `new Date()` dentro. Testar "últimos 90
 * dias" sem poder fixar o presente é testar o relógio, não a função.
 *
 * Usa aritmética de data LOCAL de propósito, e isso é seguro aqui: sem horário
 * de verão no Brasil (extinto em 2019), recuar 30 dias de calendário e recuar
 * 30×24h caem no mesmo instante. É uma janela rolante, sem fronteira de dia
 * exposta ao usuário — por isso não precisa do helper de fuso. Se o horário de
 * verão voltar, esta função passa a merecer uma segunda olhada.
 */
export const periodStart = (period: OrderPeriod, now: Date): Date | null => {
  const start = new Date(now)
  switch (period) {
    case '30d':
      start.setDate(start.getDate() - 30)
      return start
    case '90d':
      start.setDate(start.getDate() - 90)
      return start
    case '6m':
      start.setMonth(start.getMonth() - 6)
      return start
    case '1y':
      start.setFullYear(start.getFullYear() - 1)
      return start
    case 'all':
      return null
  }
}

export const CUSTOMER_ORDER_SORTABLE = [
  '-createdAt',
  'createdAt',
  '-total',
  'total',
  '-number',
  'number',
] as const

export const customerOrderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  /** Teto baixo: o card é alto, e ninguém rola 100 pedidos. */
  perPage: z.coerce.number().int().positive().max(50).default(10),
  situation: orderSituationSchema.optional(),
  period: orderPeriodSchema.default('all'),
  /** "#1042", "1042" ou parte do nome de um produto. */
  q: z.string().trim().max(80).optional(),
  sort: z.enum(CUSTOMER_ORDER_SORTABLE).default('-createdAt'),
})

export type CustomerOrderListQuery = z.infer<typeof customerOrderListQuerySchema>

// ---------------------------------------------------------------------------
// DTO da listagem — leve de propósito
// ---------------------------------------------------------------------------

/**
 * O card mostra UMA miniatura, então a API manda UMA. Devolver os itens todos
 * para renderizar uma foto de 64px é o tipo de desperdício que só aparece
 * quando o cliente fiel tem 80 pedidos.
 */
export const customerOrderListItemSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  createdAt: z.string(),
  situation: orderSituationSchema,
  total: moneySchema,
  /** Nº de LINHAS do pedido, não a soma das quantidades. */
  itemCount: z.number().int(),
  /** Produto de maior valor do pedido: a "capa" do card. */
  highlightName: z.string(),
  highlightImageUrl: z.string().nullable(),
  /** Null enquanto não há pagamento — a UI diz "aguardando pagamento". */
  paymentMethod: paymentMethodSchema.nullable(),
  estimatedDeliveryAt: z.string().nullable(),
})

export type CustomerOrderListItem = z.infer<typeof customerOrderListItemSchema>

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export const CUSTOMER_TIMELINE_STEPS = [
  'PLACED',
  'PAID',
  'PICKING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const

export const customerTimelineStepKeySchema = z.enum(CUSTOMER_TIMELINE_STEPS)
export type CustomerTimelineStepKey = z.infer<typeof customerTimelineStepKeySchema>

export const TIMELINE_STEP_LABEL: Record<CustomerTimelineStepKey, string> = {
  PLACED: 'Pedido realizado',
  PAID: 'Pagamento aprovado',
  PICKING: 'Em separação',
  SHIPPED: 'Enviado',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
}

type EventView = {
  label: string
  step?: CustomerTimelineStepKey
  /** Quando true, a `description` do evento vai para o cliente. */
  showText?: boolean
}

/**
 * WHITELIST. Um tipo que não está aqui NÃO chega ao cliente — é o que impede
 * uma nota interna ("cliente ligou reclamando, ver com o financeiro") aparecer
 * na conta dele porque alguém adicionou um evento e esqueceu de filtrar.
 *
 * `showText` só é ligado em eventos cujo texto o PRÓPRIO CLIENTE escreveu.
 * Texto redigido por staff nunca é exibido, mesmo em evento visível.
 */
export const CUSTOMER_EVENT_VIEW: Record<string, EventView> = {
  [EVENTS.order.created]: { label: 'Pedido realizado', step: 'PLACED' },
  [EVENTS.order.paid]: { label: 'Pagamento aprovado', step: 'PAID' },
  [EVENTS.order.paymentFailed]: { label: 'Pagamento não aprovado' },
  [EVENTS.order.picking]: { label: 'Em separação', step: 'PICKING' },
  [EVENTS.order.readyToShip]: { label: 'Pronto para envio' },
  [EVENTS.order.shipped]: { label: 'Pedido enviado', step: 'SHIPPED' },
  [EVENTS.order.outForDelivery]: { label: 'Saiu para entrega', step: 'OUT_FOR_DELIVERY' },
  [EVENTS.order.delivered]: { label: 'Pedido entregue', step: 'DELIVERED' },
  [EVENTS.order.returned]: { label: 'Pedido devolvido' },
  [EVENTS.order.canceled]: { label: 'Pedido cancelado' },
  [EVENTS.order.refunded]: { label: 'Reembolso efetuado' },
  [EVENTS.order.cancelRequested]: { label: 'Cancelamento solicitado', showText: true },
  [EVENTS.order.supportMessage]: { label: 'Mensagem enviada ao suporte', showText: true },
}

/**
 * Eventos deliberadamente ocultos do cliente. Existe para o teste conseguir
 * exigir uma DECISÃO sobre cada tipo novo: sem esta lista, esquecer de
 * whitelistar e escolher esconder seriam indistinguíveis.
 */
export const CUSTOMER_HIDDEN_EVENTS: readonly string[] = [
  EVENTS.order.noteAdded,
  EVENTS.order.refundRequested,
]

export const customerOrderEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  /** Só preenchido quando o texto é autoral do cliente. Nunca texto de staff. */
  detail: z.string().nullable(),
  createdAt: z.string(),
})

export type CustomerOrderEvent = z.infer<typeof customerOrderEventSchema>

export const customerTimelineStepSchema = z.object({
  key: customerTimelineStepKeySchema,
  label: z.string(),
  reachedAt: z.string().nullable(),
})

export type CustomerTimelineStep = z.infer<typeof customerTimelineStepSchema>

type RawEvent = {
  id: string
  type: string
  description: string
  createdAt: Date | string
}

/**
 * Filtra, rotula e monta a escada de progresso.
 *
 * Pedido cancelado não recebe escada: mostrar "Entregue" apagado num pedido
 * morto sugere que ainda há algo por vir. A lista cronológica continua, porque
 * o cliente precisa ver quando e por quê.
 */
export const buildCustomerTimeline = (
  events: readonly RawEvent[],
  opts: { canceled: boolean },
): { entries: CustomerOrderEvent[]; steps: CustomerTimelineStep[] } => {
  const chronological = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )

  const entries: CustomerOrderEvent[] = []
  const reachedAt = new Map<CustomerTimelineStepKey, string>()

  for (const event of chronological) {
    const view = CUSTOMER_EVENT_VIEW[event.type]
    if (!view) continue

    const at = new Date(event.createdAt).toISOString()
    entries.push({
      id: event.id,
      type: event.type,
      label: view.label,
      detail: view.showText ? event.description : null,
      createdAt: at,
    })

    // Primeira ocorrência vence: reenviar um pacote não reescreve a data em que
    // ele saiu pela primeira vez.
    if (view.step && !reachedAt.has(view.step)) reachedAt.set(view.step, at)
  }

  const steps = opts.canceled
    ? []
    : CUSTOMER_TIMELINE_STEPS.map((key) => ({
        key,
        label: TIMELINE_STEP_LABEL[key],
        reachedAt: reachedAt.get(key) ?? null,
      }))

  return { entries, steps }
}

// ---------------------------------------------------------------------------
// Cancelamento pelo cliente
// ---------------------------------------------------------------------------

export const CUSTOMER_CANCEL_MODES = ['IMMEDIATE', 'REQUEST', 'NONE'] as const
export const customerCancelModeSchema = z.enum(CUSTOMER_CANCEL_MODES)
export type CustomerCancelMode = z.infer<typeof customerCancelModeSchema>

/**
 * Quanto o cliente pode fazer sozinho.
 *
 * IMMEDIATE só quando não há dinheiro nem trabalho envolvido: nada foi pago e
 * ninguém tirou o produto da prateleira. Aí cancelar é seguro e instantâneo —
 * a reserva volta para o estoque e ninguém precisa ser acordado.
 *
 * Pago ou já em separação vira REQUEST: existe estorno a decidir ou uma caixa
 * meio montada no depósito. O staff resolve no admin.
 */
export const customerCancelMode = (o: {
  canceledAt: string | Date | null
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
}): CustomerCancelMode => {
  if (o.canceledAt) return 'NONE'
  if (o.fulfillmentStatus === 'DELIVERED' || o.fulfillmentStatus === 'RETURNED') return 'NONE'
  if (o.paymentStatus === 'REFUNDED' || o.paymentStatus === 'PARTIALLY_REFUNDED') return 'NONE'

  const unpaid = o.paymentStatus === 'PENDING' || o.paymentStatus === 'FAILED'
  if (unpaid && o.fulfillmentStatus === 'UNFULFILLED') return 'IMMEDIATE'

  return 'REQUEST'
}

export const customerCancelSchema = z.object({
  reason: z.string().trim().min(5, 'Conte o motivo em pelo menos 5 caracteres').max(500),
})

export type CustomerCancelInput = z.infer<typeof customerCancelSchema>

// ---------------------------------------------------------------------------
// Suporte
// ---------------------------------------------------------------------------

export const SUPPORT_TOPICS = ['DELIVERY', 'PAYMENT', 'PRODUCT', 'CANCELLATION', 'OTHER'] as const
export const supportTopicSchema = z.enum(SUPPORT_TOPICS)
export type SupportTopic = z.infer<typeof supportTopicSchema>

export const supportMessageSchema = z.object({
  topic: supportTopicSchema.default('OTHER'),
  message: z.string().trim().min(10, 'Descreva com pelo menos 10 caracteres').max(1000),
})

export type SupportMessageInput = z.infer<typeof supportMessageSchema>

// ---------------------------------------------------------------------------
// Comprar de novo
// ---------------------------------------------------------------------------

export const REORDER_SKIP_REASONS = ['UNAVAILABLE', 'OUT_OF_STOCK', 'PARTIAL'] as const
export const reorderSkipReasonSchema = z.enum(REORDER_SKIP_REASONS)
export type ReorderSkipReason = z.infer<typeof reorderSkipReasonSchema>

export const reorderSkippedSchema = z.object({
  productName: z.string(),
  reason: reorderSkipReasonSchema,
  requested: z.number().int(),
  added: z.number().int(),
})

export const reorderAddedSchema = z.object({
  variantId: z.string(),
  productName: z.string(),
  quantity: z.number().int(),
})

/**
 * Falha parcial é o caso ESPERADO, não a exceção: variante apagada, produto
 * despublicado, estoque menor que o comprado. Por isso a resposta reporta os
 * dois lados em vez de estourar no primeiro item indisponível.
 */
export const reorderResultSchema = z.object({
  added: z.array(reorderAddedSchema),
  skipped: z.array(reorderSkippedSchema),
})

export type ReorderResult = z.infer<typeof reorderResultSchema>

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

/**
 * `extend` e não um schema novo: `GET /orders/:id` continua satisfazendo o tipo
 * `Order` que a tela de pagamento do checkout já consome. Redefinir do zero
 * quebraria aquela tela na primeira divergência de campo.
 */
export const customerOrderItemSchema = orderItemSchema.extend({
  /** Null quando a variante foi apagada — "comprar de novo" pula o item. */
  variantId: z.string().nullable(),
  productSlug: z.string().nullable(),
  reorderable: z.boolean(),
})

export type CustomerOrderItem = z.infer<typeof customerOrderItemSchema>

export const customerOrderPaymentSchema = z.object({
  status: paymentStatusSchema,
  method: paymentMethodSchema.nullable(),
  amount: moneySchema,
  refundedAmount: moneySchema,
  paidAt: z.string().nullable(),
})

export const customerOrderSchema = orderSchema.extend({
  situation: orderSituationSchema,
  canceledAt: z.string().nullable(),
  /** Só o motivo escrito PELO CLIENTE. Motivo de staff é texto interno. */
  cancelReason: z.string().nullable(),
  couponCodeSnapshot: z.string().nullable(),

  items: z.array(customerOrderItemSchema),

  timeline: z.array(customerOrderEventSchema),
  steps: z.array(customerTimelineStepSchema),

  payment: customerOrderPaymentSchema.nullable(),

  estimatedDeliveryAt: z.string().nullable(),
  trackingCode: z.string().nullable(),
  trackingUrl: z.string().nullable(),
  invoiceUrl: z.string().nullable(),
  invoiceNumber: z.string().nullable(),

  /** Derivados, para o front não repetir a regra de guarda. */
  cancelMode: customerCancelModeSchema,
  cancelRequestedAt: z.string().nullable(),
})

export type CustomerOrder = z.infer<typeof customerOrderSchema>
