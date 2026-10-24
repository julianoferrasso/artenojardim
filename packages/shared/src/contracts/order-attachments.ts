import { spWeekday } from '../utils/date-br.js'

/**
 * Rastreio, nota fiscal e previsão de entrega — sem coluna no banco.
 *
 * NÃO existe `trackingCode`, `invoiceUrl` nem `estimatedDeliveryAt` no modelo
 * Order. Estes dados vivem no `metadataJson` de um OrderEvent, gravado pelo
 * staff quando marca o pedido como enviado. Isto é uma convenção de LEITURA: a
 * UI só mostra o bloco quando a chave existe — nunca "Rastreio: —".
 *
 * GATILHO DE MIGRATION: quando a compra de etiqueta do Melhor Envio entrar
 * (roadmap 16), nasce o modelo `Shipment` com colunas de verdade e este arquivo
 * morre. Até lá, um Json opcional é mais honesto que uma coluna que ninguém
 * preenche.
 */

export const ORDER_META = {
  trackingCode: 'trackingCode',
  trackingUrl: 'trackingUrl',
  invoiceUrl: 'invoiceUrl',
  invoiceNumber: 'invoiceNumber',
} as const

export type OrderAttachments = {
  trackingCode: string | null
  trackingUrl: string | null
  invoiceUrl: string | null
  invoiceNumber: string | null
}

type MetaCarrier = {
  metadataJson?: unknown
  createdAt: Date | string
}

const readString = (source: Record<string, unknown>, key: string): string | null => {
  const value = source[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Varre os eventos do mais NOVO para o mais antigo: se o staff corrigiu um
 * código digitado errado postando outro evento, o segundo vence sem que
 * ninguém precise editar o primeiro.
 *
 * Nunca lança. `metadataJson` é um Json livre no Postgres — pode chegar null,
 * string, array ou um objeto com formato inesperado, e uma exceção aqui
 * derrubaria a tela inteira do pedido por causa de um campo decorativo.
 */
export const readOrderAttachments = (events: readonly MetaCarrier[]): OrderAttachments => {
  const result: OrderAttachments = {
    trackingCode: null,
    trackingUrl: null,
    invoiceUrl: null,
    invoiceNumber: null,
  }

  const newestFirst = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  for (const event of newestFirst) {
    const meta = event.metadataJson
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) continue
    const source = meta as Record<string, unknown>

    result.trackingCode ??= readString(source, ORDER_META.trackingCode)
    result.trackingUrl ??= readString(source, ORDER_META.trackingUrl)
    result.invoiceUrl ??= readString(source, ORDER_META.invoiceUrl)
    result.invoiceNumber ??= readString(source, ORDER_META.invoiceNumber)
  }

  return result
}

/**
 * Soma dias ÚTEIS. As transportadoras cotam prazo em dias úteis; somar dias
 * corridos daria uma data otimista que a loja não cumpre — e prazo estourado é
 * ticket de suporte.
 *
 * Feriado não é considerado: exigiria calendário nacional + municipal, e errar
 * por um dia é melhor que manter uma tabela de feriados desatualizada.
 */
export const addBusinessDays = (from: Date, days: number): Date => {
  const result = new Date(from)
  let remaining = Math.max(0, days)

  while (remaining > 0) {
    // Avanço em UTC: são 24h absolutas, sem depender do fuso do processo.
    result.setUTCDate(result.getUTCDate() + 1)
    // Mas "é fim de semana?" é pergunta LOCAL: um pedido pago às 23h de sexta em
    // Brasília já é sábado em UTC, e contar por UTC pularia um dia útil à toa.
    const weekday = spWeekday(result)
    if (weekday !== 0 && weekday !== 6) remaining -= 1
  }

  return result
}

export type DeliveryEstimateInput = {
  /** Data do evento de envio, quando já houve. */
  shippedAt: Date | string | null
  /** Data do pagamento aprovado. */
  paidAt: Date | string | null
  deliveryDays: number
  /** Dias úteis de produção (encomenda). Só contam antes do envio. */
  productionDays?: number
}

const toDate = (value: Date | string): Date | null => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Inteiro positivo ou 0: `NaN` faria o `addBusinessDays` devolver a própria âncora. */
const wholeDays = (days: number | undefined): number =>
  days !== undefined && Number.isFinite(days) && days > 0 ? Math.floor(days) : 0

/**
 * Âncora: envio, se houve; senão, pagamento. O prazo da transportadora começa a
 * contar quando o pacote entra na rede dela, não quando o cliente clicou em
 * comprar — ancorar na criação do pedido daria uma data que já nasce errada
 * para quem pagou por boleto.
 *
 * Ancorado no pagamento, a produção da encomenda vem antes do frete. Depois do
 * envio ela já aconteceu, e somá-la de novo atrasaria a data à toa.
 *
 * Sem nenhuma das duas âncoras devolve null, e a UI diz que o prazo passa a
 * contar após a confirmação do pagamento.
 */
export const estimateDelivery = (input: DeliveryEstimateInput): string | null => {
  const anchor = input.shippedAt ?? input.paidAt
  if (!anchor) return null
  if (!Number.isFinite(input.deliveryDays) || input.deliveryDays <= 0) return null

  const start = toDate(anchor)
  if (!start) return null

  const production = input.shippedAt ? 0 : wholeDays(input.productionDays)
  return addBusinessDays(start, production + input.deliveryDays).toISOString()
}

/**
 * Até quando a encomenda tem de ficar pronta: pagamento + dias úteis de
 * produção. null sem produção ou sem pagamento — o relógio só anda depois dele.
 */
export const estimateProductionDue = (input: {
  paidAt: Date | string | null
  productionDays: number
}): string | null => {
  const days = wholeDays(input.productionDays)
  if (days === 0 || !input.paidAt) return null
  const start = toDate(input.paidAt)
  return start ? addBusinessDays(start, days).toISOString() : null
}
