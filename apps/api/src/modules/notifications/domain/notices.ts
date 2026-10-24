import {
  PAYMENT_METHOD_LABEL,
  REFUND_TIMING_LABEL,
  SUPPORT_TOPIC_LABEL,
  businessDaysLabel,
  type PaymentMethod,
} from '@ecommerce/shared/constants'
import type { SupportTopic } from '@ecommerce/shared/contracts'
import { formatSpDeadline } from '@ecommerce/shared/utils'
import type { NoticeContent } from '../../../integrations/email/index.js'
import type { AutoRefundOutcome } from '../../payments/domain/refund.js'
import { formatBRL } from '../../../utils/money.js'

/**
 * O TEXTO de cada aviso por e-mail, em funções puras: recebem o que o service
 * leu do banco e devolvem assunto, parágrafos e botão. Testáveis sem fila e sem
 * SES — e é aqui que se muda uma frase.
 *
 * Dois públicos: o cliente (tom de loja, nunca texto interno) e a equipe (direto,
 * com o que pede ação no assunto, para chamar atenção na caixa de entrada).
 *
 * Os da equipe viram ALERTA (e-mail, Telegram, WhatsApp), e o `heading` vira o
 * título guardado no histórico: por isso ele nunca leva nome de cliente — o
 * texto completo só viaja na fila, e o banco não guarda dado pessoal ali.
 */

export type NoticeOrder = {
  number: number
  customerName: string
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? ''

const hello = (order: NoticeOrder): string => {
  const name = firstName(order.customerName)
  return name ? `Olá, ${name}.` : 'Olá.'
}

/** Quebra o texto digitado em parágrafos: o layout escapa e envolve cada um em <p>. */
export const toParagraphs = (body: string): string[] =>
  body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

const refundTiming = (method: PaymentMethod | null): string =>
  method ? REFUND_TIMING_LABEL[method] : 'O valor volta pelo mesmo meio usado no pagamento.'

const CUSTOMER_FOOTER =
  'Ficou alguma dúvida? Fale com a gente pela página do pedido, na sua conta da loja.'

const STAFF_FOOTER = 'Aviso automático da loja. Responda pelo painel: respostas a este e-mail não chegam ao cliente.'

// ── Cliente ──────────────────────────────────────────────────────────────────

/**
 * Confirmação do cancelamento. O Decreto 7.962 pede confirmação IMEDIATA de que
 * o pedido do consumidor foi recebido — é este e-mail.
 */
export const customerCanceledNotice = (p: {
  order: NoticeOrder
  /** `system` = o prazo de pagamento venceu e o job cancelou. */
  by: 'customer' | 'store' | 'system'
  refund: AutoRefundOutcome
  orderUrl: string
}): NoticeContent => {
  const opening =
    p.by === 'customer'
      ? `${hello(p.order)} Confirmamos o cancelamento do pedido #${p.order.number}, como você pediu.`
      : p.by === 'store'
        ? `${hello(p.order)} Aprovamos o seu pedido de cancelamento: o pedido #${p.order.number} foi cancelado.`
        : `${hello(p.order)} O prazo para pagar o pedido #${p.order.number} terminou, e ele foi cancelado. As peças voltaram para a loja: se ainda quiser, é só fazer um novo pedido.`

  // No vencimento, a abertura já explica que nada foi pago.
  const nothingToRefund =
    p.by === 'system' ? [] : ['Como o pagamento não chegou a ser feito, não há nada a estornar.']

  const refund =
    p.refund.status === 'requested'
      ? [
          `O estorno de ${formatBRL(p.refund.amount)} já foi solicitado.`,
          refundTiming(p.refund.method),
        ]
      : p.refund.status === 'failed'
        ? [
            `O estorno de ${formatBRL(p.refund.amount)} está em processamento.`,
            'Avisaremos por e-mail assim que ele for concluído.',
          ]
        : nothingToRefund

  return {
    subject: `Pedido #${p.order.number} cancelado`,
    heading: 'Pedido cancelado',
    paragraphs: [opening, ...refund],
    ctaLabel: 'Ver o pedido',
    ctaUrl: p.orderUrl,
    footerNote: CUSTOMER_FOOTER,
  }
}

/**
 * Reposição do "Avise-me quando chegar". Transacional (a pessoa pediu este
 * aviso, e só este): sem link de newsletter, e o texto diz que não vem outro —
 * a inscrição é apagada no envio.
 *
 * Com `productionDays`, o produto não voltou à prateleira: passou a ser feito sob
 * encomenda. Dizer "voltou ao estoque" prometeria uma pronta entrega que não há.
 */
export const customerBackInStockNotice = (p: {
  productName: string
  /** Opções da variação ("Lavanda / 300 g"). Null quando o produto não tem variação. */
  variantLabel: string | null
  productUrl: string
  /** Preenchido quando o produto passou a ser sob encomenda. */
  productionDays?: number | null
}): NoticeContent => {
  const name = p.variantLabel ? `${p.productName} (${p.variantLabel})` : p.productName
  if (p.productionDays) {
    return {
      subject: `Agora sob encomenda: ${name}`,
      heading: 'Agora dá para encomendar',
      paragraphs: [
        `Olá! ${name} pode ser encomendado na loja.`,
        `Produzimos depois da compra, em até ${businessDaysLabel(p.productionDays)} após a confirmação do pagamento, e enviamos em seguida.`,
        'Este é o único aviso que você vai receber sobre esta peça.',
      ],
      ctaLabel: 'Ver o produto',
      ctaUrl: p.productUrl,
      footerNote: 'Você recebeu este e-mail porque pediu para ser avisado quando o produto voltasse.',
    }
  }
  return {
    subject: `Voltou: ${name}`,
    heading: 'Voltou ao estoque',
    paragraphs: [
      `Olá! ${name} está disponível de novo na loja.`,
      'Produzimos em pequenos lotes, então as unidades podem acabar rápido.',
      'Este é o único aviso que você vai receber sobre esta peça.',
    ],
    ctaLabel: 'Ver o produto',
    ctaUrl: p.productUrl,
    footerNote: 'Você recebeu este e-mail porque pediu para ser avisado quando o produto voltasse.',
  }
}

export const customerCancelRequestNotice = (p: {
  order: NoticeOrder
  refundAmount: number
  orderUrl: string
  /** A encomenda já está em produção (e não em separação). Muda só a frase. */
  inProduction?: boolean
}): NoticeContent => ({
  subject: `Recebemos o pedido de cancelamento do #${p.order.number}`,
  heading: 'Pedido de cancelamento recebido',
  paragraphs: [
    `${hello(p.order)} Recebemos o seu pedido para cancelar o pedido #${p.order.number}.`,
    p.inProduction
      ? 'Como a sua encomenda já está em produção, nossa equipe vai analisar e responder em até 1 dia útil.'
      : 'Como ele já estava sendo separado, nossa equipe vai analisar e responder em até 1 dia útil.',
    ...(p.refundAmount > 0
      ? [`Se o cancelamento for aprovado, o estorno de ${formatBRL(p.refundAmount)} é feito automaticamente.`]
      : []),
  ],
  ctaLabel: 'Acompanhar o pedido',
  ctaUrl: p.orderUrl,
  footerNote: CUSTOMER_FOOTER,
})

export const customerRefundedNotice = (p: {
  order: NoticeOrder
  amount: number
  method: PaymentMethod | null
  orderUrl: string
}): NoticeContent => ({
  subject: `Estorno do pedido #${p.order.number}`,
  heading: 'Estorno solicitado',
  paragraphs: [
    `${hello(p.order)} Solicitamos o estorno de ${formatBRL(p.amount)} referente ao pedido #${p.order.number}.`,
    refundTiming(p.method),
  ],
  ctaLabel: 'Ver o pedido',
  ctaUrl: p.orderUrl,
  footerNote: CUSTOMER_FOOTER,
})

export const customerReplyNotice = (p: {
  order: NoticeOrder
  body: string
  kind: 'reply' | 'cancel_declined'
  orderUrl: string
}): NoticeContent => ({
  subject:
    p.kind === 'cancel_declined'
      ? `Sobre o cancelamento do pedido #${p.order.number}`
      : `Resposta sobre o pedido #${p.order.number}`,
  heading: p.kind === 'cancel_declined' ? 'Sobre o seu pedido de cancelamento' : 'Respondemos a sua mensagem',
  paragraphs: [
    p.kind === 'cancel_declined'
      ? `${hello(p.order)} Analisamos o seu pedido de cancelamento do #${p.order.number} e não foi possível aprová-lo:`
      : `${hello(p.order)} Respondemos a sua mensagem sobre o pedido #${p.order.number}:`,
    ...toParagraphs(p.body),
  ],
  ctaLabel: 'Ver a conversa',
  ctaUrl: p.orderUrl,
  footerNote: 'Para continuar a conversa, responda pela página do pedido — assim a resposta fica junto do histórico.',
})

// ── Equipe ───────────────────────────────────────────────────────────────────

export const staffMessageNotice = (p: {
  order: NoticeOrder
  topic: SupportTopic | null
  body: string
  threadUrl: string
}): NoticeContent => ({
  subject: `[Atendimento] Pedido #${p.order.number} — mensagem de ${p.order.customerName}`,
  heading: `Mensagem sobre o pedido #${p.order.number}`,
  paragraphs: [
    `${p.order.customerName} escreveu${p.topic ? ` (assunto: ${SUPPORT_TOPIC_LABEL[p.topic]})` : ''}:`,
    ...toParagraphs(p.body),
  ],
  ctaLabel: 'Responder no painel',
  ctaUrl: p.threadUrl,
  footerNote: STAFF_FOOTER,
})

export const staffCanceledNotice = (p: {
  order: NoticeOrder
  reason: string
  refund: AutoRefundOutcome
  orderUrl: string
  /** Havia peça da prateleira reservada. Encomenda pura não reserva nada. */
  reservedStock: boolean
}): NoticeContent => {
  const failed = p.refund.status === 'failed'
  const refund =
    p.refund.status === 'requested'
      ? `Estorno automático de ${formatBRL(p.refund.amount)} solicitado ao provedor.`
      : p.refund.status === 'failed'
        ? `O estorno automático de ${formatBRL(p.refund.amount)} foi RECUSADO pelo provedor. Reembolse pelo painel (botão Reembolsar no pedido).`
        : `Pedido sem pagamento: nada a estornar.${p.reservedStock ? ' A reserva de estoque foi liberada.' : ''}`

  return {
    subject: failed
      ? `[Ação necessária] Pedido #${p.order.number} cancelado — estorno falhou`
      : `[Cancelamento] Pedido #${p.order.number} cancelado pelo cliente`,
    heading: `Pedido #${p.order.number} cancelado pelo cliente`,
    paragraphs: [`${p.order.customerName} cancelou o pedido. Motivo: ${p.reason}`, refund],
    ctaLabel: 'Abrir o pedido',
    ctaUrl: p.orderUrl,
    footerNote: STAFF_FOOTER,
  }
}

export const staffCancelRequestNotice = (p: {
  order: NoticeOrder
  reason: string
  threadUrl: string
  inProduction?: boolean
}): NoticeContent => ({
  subject: `[Ação necessária] Pedido #${p.order.number} — cliente pediu cancelamento`,
  heading: `Pedido de cancelamento do #${p.order.number}`,
  paragraphs: [
    `${p.order.customerName} pediu para cancelar ${p.inProduction ? 'uma encomenda que já está em produção' : 'um pedido que já está em separação'}. Motivo: ${p.reason}`,
    'Aprovar cancela o pedido e estorna o pagamento automaticamente. Recusar exige uma explicação, que vai para o cliente.',
  ],
  ctaLabel: 'Decidir no painel',
  ctaUrl: p.threadUrl,
  footerNote: STAFF_FOOTER,
})

export const staffRefundFailedNotice = (p: {
  order: NoticeOrder
  amount: number
  orderUrl: string
}): NoticeContent => ({
  subject: `[Ação necessária] Estorno do pedido #${p.order.number} falhou`,
  heading: `Estorno do pedido #${p.order.number} falhou`,
  paragraphs: [
    `O pagamento do pedido #${p.order.number} chegou depois do cancelamento, e o estorno automático de ${formatBRL(p.amount)} foi recusado pelo provedor.`,
    'Causas comuns: saldo insuficiente ou dinheiro ainda não liberado na conta. Reembolse pelo painel (botão Reembolsar no pedido).',
  ],
  ctaLabel: 'Abrir o pedido',
  ctaUrl: p.orderUrl,
  footerNote: STAFF_FOOTER,
})

// ── Equipe: pedidos, estoque e sistema ───────────────────────────────────────

export type OrderSummary = NoticeOrder & {
  total: number
  method: PaymentMethod | null
  /** `madeToOrderQuantity`: quantas unidades da linha são produzidas (o resto sai da prateleira). */
  items: { label: string; quantity: number; madeToOrderQuantity: number }[]
  /** "Total Express Standard — Caxias do Sul/RS". Null sem frete gravado. */
  shipping: string | null
  couponCode: string | null
  /** Dias úteis de produção; 0 = tudo pronta entrega. */
  productionDays: number
  /** Até quando produzir — só existe depois do pagamento. */
  productionDueAt: Date | null
}

/** Pedido grande não vira mensagem de três telas: os primeiros itens e a contagem do resto. */
const MAX_ITEMS_LISTED = 8

const producePart = (item: OrderSummary['items'][number]): string => {
  if (item.madeToOrderQuantity <= 0) return ''
  return item.madeToOrderQuantity >= item.quantity ? ' — a produzir' : ` — ${item.madeToOrderQuantity} a produzir`
}

const reservesStock = (order: OrderSummary): boolean =>
  order.items.some((item) => item.quantity > item.madeToOrderQuantity)

/** O que fazer com o pedido pago: separar, ou produzir até a data. */
const nextStep = (order: OrderSummary): string => {
  if (order.productionDays <= 0) return 'Já pode separar.'
  const due = order.productionDueAt ? ` até ${formatSpDeadline(order.productionDueAt)}` : ''
  return `Tem encomenda: produzir${due} (${businessDaysLabel(order.productionDays)}).`
}

const itemLines = (items: OrderSummary['items']): string[] => [
  ...items.slice(0, MAX_ITEMS_LISTED).map((item) => `${item.quantity}× ${item.label}${producePart(item)}`),
  ...(items.length > MAX_ITEMS_LISTED ? [`… e mais ${items.length - MAX_ITEMS_LISTED} itens.`] : []),
]

const orderExtras = (order: OrderSummary): string[] => [
  ...(order.shipping ? [`Entrega: ${order.shipping}.`] : []),
  ...(order.couponCode ? [`Cupom: ${order.couponCode}.`] : []),
]

export const staffOrderPaidNotice = (p: { order: OrderSummary; orderUrl: string }): NoticeContent => ({
  subject: `[Pedido pago] #${p.order.number} — ${formatBRL(p.order.total)}`,
  heading: `Novo pedido pago: #${p.order.number}`,
  paragraphs: [
    `${p.order.customerName} pagou ${formatBRL(p.order.total)}${p.order.method ? ` (${PAYMENT_METHOD_LABEL[p.order.method]})` : ''}. ${nextStep(p.order)}`,
    ...itemLines(p.order.items),
    ...orderExtras(p.order),
  ],
  ctaLabel: 'Abrir o pedido',
  ctaUrl: p.orderUrl,
  footerNote: STAFF_FOOTER,
})

export const staffOrderCreatedNotice = (p: { order: OrderSummary; orderUrl: string }): NoticeContent => ({
  subject: `[Aguardando pagamento] Pedido #${p.order.number} — ${formatBRL(p.order.total)}`,
  heading: `Pedido #${p.order.number} aguardando pagamento`,
  paragraphs: [
    `${p.order.customerName} fechou um pedido de ${formatBRL(p.order.total)}; o pagamento ainda não foi confirmado.`,
    ...itemLines(p.order.items),
    ...orderExtras(p.order),
    reservesStock(p.order)
      ? 'O estoque fica reservado enquanto o pedido estiver aberto. Se o pagamento não vier no prazo, o pedido é cancelado sozinho e a reserva volta para a loja.'
      : 'É tudo sob encomenda: nada fica reservado. Se o pagamento não vier no prazo, o pedido é cancelado sozinho.',
  ],
  ctaLabel: 'Abrir o pedido',
  ctaUrl: p.orderUrl,
  footerNote: STAFF_FOOTER,
})

export type LowStockItem = {
  productName: string
  /** Opções da variante ("300 g"). Null quando o produto não tem variação. */
  variantLabel: string | null
  sku: string
  onHand: number
  reserved: number
  /** Híbrido: sem estoque ele continua vendendo, sob encomenda — não "esgota". */
  madeToOrderFallback: boolean
}

const itemName = (item: LowStockItem): string =>
  item.variantLabel ? `${item.productName} (${item.variantLabel})` : item.productName

const units = (n: number): string => (n === 1 ? '1 unidade' : `${n} unidades`)

const stockLine = (item: LowStockItem): string => {
  const available = item.onHand - item.reserved
  const state =
    available <= 0
      ? item.madeToOrderFallback
        ? 'acabou a pronta entrega (segue vendendo sob encomenda)'
        : 'esgotado'
      : `${units(available)} ${available === 1 ? 'disponível' : 'disponíveis'}`
  // Reserva é pedido não pago: o físico ainda está na prateleira, e o cliente não vê.
  const reserved = item.reserved > 0 ? ` (${units(item.onHand)} em estoque, ${item.reserved} reservada${item.reserved === 1 ? '' : 's'} em pedidos não pagos)` : ''
  return `${itemName(item)}, SKU ${item.sku}: ${state}${reserved}.`
}

export const staffLowStockNotice = (p: {
  items: LowStockItem[]
  threshold: number
  stockUrl: string
}): NoticeContent => {
  const soldOut = p.items.filter((item) => item.onHand - item.reserved <= 0 && !item.madeToOrderFallback)
  const single = p.items.length === 1 ? p.items[0] : undefined
  const heading = single
    ? `${soldOut.length > 0 ? 'Esgotado' : 'Estoque baixo'}: ${itemName(single)}`
    : soldOut.length === p.items.length
      ? `${p.items.length} produtos esgotaram`
      : `Estoque baixo em ${p.items.length} produtos`

  return {
    subject: `[Estoque] ${heading}`,
    heading,
    paragraphs: [
      ...p.items.map(stockLine),
      `O limite de estoque baixo da loja é ${units(p.threshold)}; dá para mudar na tela Alertas do painel.`,
    ],
    ctaLabel: 'Abrir o estoque',
    ctaUrl: p.stockUrl,
    footerNote: STAFF_FOOTER,
  }
}

export type ProductionDueOrder = { number: number; dueAt: Date }

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/**
 * O resumo diário da produção: o que já passou do prazo e o que vence até o
 * próximo dia útil. Só números de pedido — o título vai para o histórico de
 * alertas, que não guarda nome de cliente.
 */
export const staffProductionDueNotice = (p: {
  overdue: ProductionDueOrder[]
  dueSoon: ProductionDueOrder[]
  ordersUrl: string
}): NoticeContent => {
  const parts = [
    p.overdue.length > 0 ? plural(p.overdue.length, 'atrasada', 'atrasadas') : null,
    p.dueSoon.length > 0 ? plural(p.dueSoon.length, 'vence logo', 'vencem logo') : null,
  ].filter((part): part is string => part !== null)
  const heading = `Encomendas: ${parts.join(', ')}`

  return {
    subject: `[Produção] ${heading}`,
    heading,
    paragraphs: [
      ...p.overdue.map((o) => `Pedido #${o.number}: o prazo de produção venceu ${formatSpDeadline(o.dueAt)}.`),
      ...p.dueSoon.map((o) => `Pedido #${o.number}: fica pronto até ${formatSpDeadline(o.dueAt)}.`),
      'Terminou a produção? Mude o pedido para "Em separação" no painel — o cliente acompanha por lá.',
    ],
    ctaLabel: 'Ver as encomendas',
    ctaUrl: p.ordersUrl,
    footerNote: STAFF_FOOTER,
  }
}

export const staffShippingDisconnectedNotice = (p: { shippingUrl: string }): NoticeContent => ({
  subject: '[Ação necessária] Frete desconectado: a loja não calcula frete',
  heading: 'Frete desconectado',
  paragraphs: [
    'A conexão com o Melhor Envio caiu. Sem ela a loja não calcula frete, e nenhum cliente consegue fechar pedido.',
    'Reconecte a conta na tela Frete do painel (exige administrador). Enquanto isso, este aviso se repete a cada 6 horas.',
  ],
  ctaLabel: 'Reconectar o frete',
  ctaUrl: p.shippingUrl,
  footerNote: STAFF_FOOTER,
})

export type SiteTargetStatus = { name: string; url: string; detail: string }

const joinNames = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`

const MONITOR_FOOTER =
  'Aviso do monitor que roda no próprio servidor da loja. Se o servidor inteiro cair, ele cai junto e não avisa: para isso, só um monitor externo.'

export const staffSiteDownNotice = (p: { targets: SiteTargetStatus[]; storeUrl: string }): NoticeContent => {
  const names = joinNames(p.targets.map((t) => t.name))
  return {
    subject: `[Fora do ar] ${names}`,
    heading: `${names} fora do ar`,
    paragraphs: [
      ...p.targets.map((t) => `${t.name} (${t.url}) não responde: ${t.detail}.`),
      'O monitor confere a cada 2 minutos e avisa de novo quando voltar.',
    ],
    ctaLabel: 'Abrir a loja',
    ctaUrl: p.storeUrl,
    footerNote: MONITOR_FOOTER,
  }
}

export const staffSiteUpNotice = (p: {
  targets: { name: string; downMinutes: number }[]
  storeUrl: string
}): NoticeContent => {
  const names = joinNames(p.targets.map((t) => t.name))
  return {
    subject: `[De volta] ${names}`,
    heading: `${names} de volta ao ar`,
    paragraphs: p.targets.map(
      (t) => `${t.name} voltou a responder depois de cerca de ${t.downMinutes} minuto${t.downMinutes === 1 ? '' : 's'} fora.`,
    ),
    ctaLabel: 'Abrir a loja',
    ctaUrl: p.storeUrl,
    footerNote: MONITOR_FOOTER,
  }
}
