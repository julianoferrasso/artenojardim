import { z } from 'zod'
import { paymentMethodSchema, paymentStatusSchema } from '../constants/enums.js'
import type { PaymentStatus, FulfillmentStatus } from '../constants/enums.js'
import { EVENTS } from '../constants/events.js'
import { CANCEL_REASON_LABEL } from '../constants/order-labels.js'
import { moneySchema } from './common.js'
import { orderItemSchema, orderSchema } from './orders.js'
import { orderSituationSchema } from './order-situation.js'
import { customerSupportThreadSchema } from './support.js'

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
  // Sem texto: a justificativa da loja é escrita por staff e vai pela conversa.
  [EVENTS.order.cancelRequestDeclined]: { label: 'Cancelamento não aprovado' },
}

/**
 * Eventos deliberadamente ocultos do cliente. Existe para o teste conseguir
 * exigir uma DECISÃO sobre cada tipo novo: sem esta lista, esquecer de
 * whitelistar e escolher esconder seriam indistinguíveis.
 *
 * `supportMessage` saiu da timeline quando o atendimento nasceu: a mensagem
 * aparece na conversa, e mostrá-la nos dois lugares duplicaria o histórico.
 */
export const CUSTOMER_HIDDEN_EVENTS: readonly string[] = [
  EVENTS.order.noteAdded,
  EVENTS.order.refundRequested,
  EVENTS.order.refundFailed,
  EVENTS.order.supportMessage,
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
 * Quanto o cliente pode fazer sozinho. O corte é a PRATELEIRA, não o dinheiro:
 *
 * IMMEDIATE enquanto ninguém começou a separar (UNFULFILLED), pago ou não. Não
 * pago: a reserva volta e o Pix em aberto morre. Pago: o estoque volta e o
 * estorno total sai automático no provedor — é o "cancelar até antes de
 * embalar" das lojas de referência, e o direito do Decreto 7.962 de se
 * arrepender pelo mesmo canal em que comprou.
 *
 * REQUEST com a caixa já sendo montada (PICKING, READY_TO_SHIP): a loja decide,
 * e aprovar estorna do mesmo jeito.
 *
 * NONE quando o pacote saiu: aí o caminho é recusar a entrega ou, depois de
 * receber, a devolução por arrependimento — conversa, não botão.
 *
 * Reembolso parcial também fecha a porta: alguém da loja já mexeu no dinheiro
 * deste pedido, e um estorno automático por cima disso é decisão que não se
 * toma sem olhar.
 */
export const customerCancelMode = (o: {
  canceledAt: string | Date | null
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
}): CustomerCancelMode => {
  if (o.canceledAt) return 'NONE'
  if (o.paymentStatus === 'REFUNDED' || o.paymentStatus === 'PARTIALLY_REFUNDED') return 'NONE'

  switch (o.fulfillmentStatus) {
    case 'UNFULFILLED':
      return 'IMMEDIATE'
    case 'PICKING':
    case 'READY_TO_SHIP':
      return 'REQUEST'
    case 'SHIPPED':
    case 'DELIVERED':
    case 'RETURNED':
      return 'NONE'
  }
}

/**
 * Motivo numa lista: dá estatística ("quantos desistem por prazo?") sem ler
 * texto livre um por um. O código vai no metadata do evento; a frase legível,
 * em `cancelReason`.
 */
export const CUSTOMER_CANCEL_REASONS = [
  'CHANGED_MIND',
  'ORDERED_BY_MISTAKE',
  'WRONG_ADDRESS_OR_ITEM',
  'FOUND_BETTER_PRICE',
  'DELIVERY_TOO_SLOW',
  'PAYMENT_ISSUE',
  'OTHER',
] as const
export const customerCancelReasonSchema = z.enum(CUSTOMER_CANCEL_REASONS)
export type CustomerCancelReason = z.infer<typeof customerCancelReasonSchema>

/**
 * `reasonCode` tem default e `reason` é opcional por compatibilidade: durante o
 * deploy, a loja antiga em cache manda só `{ reason }` — e continua válida.
 * Em "Outro", o texto é o motivo, então passa a ser obrigatório.
 */
export const customerCancelSchema = z
  .object({
    reasonCode: customerCancelReasonSchema.default('OTHER'),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.reasonCode !== 'OTHER' || (v.reason?.length ?? 0) >= 5, {
    message: 'Conte o motivo em pelo menos 5 caracteres',
    path: ['reason'],
  })

export type CustomerCancelInput = z.infer<typeof customerCancelSchema>

/** A frase que vai para `cancelReason`: "Comprei por engano: era o aroma errado". */
export const cancelReasonText = (input: CustomerCancelInput): string => {
  const detail = input.reason?.trim()
  if (input.reasonCode === 'OTHER') return detail || CANCEL_REASON_LABEL.OTHER
  const label = CANCEL_REASON_LABEL[input.reasonCode]
  return detail ? `${label}: ${detail}` : label
}

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
  /**
   * Quanto volta se cancelar agora: o pago menos o já reembolsado. Calculado na
   * API (regra 5) — a loja só mostra. Zero quando não há pagamento.
   */
  cancelRefundAmount: moneySchema,

  /** A conversa com a loja sobre este pedido. Null até a primeira mensagem. */
  support: customerSupportThreadSchema.nullable(),
})

export type CustomerOrder = z.infer<typeof customerOrderSchema>
