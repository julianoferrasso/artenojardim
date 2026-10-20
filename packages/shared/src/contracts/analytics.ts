import { z } from 'zod'
import { moneySchema } from './common.js'
import { paymentMethodSchema } from '../constants/enums.js'
import {
  GRANULARITIES,
  MAX_RANGE_DAYS,
  allowedGranularities,
  isDayKey,
  spanDays,
} from '../utils/date-range.js'

/**
 * Contratos de analytics: os registros que a loja dispara (visualização de
 * produto, visita) e o dashboard do admin. Valores monetários são SEMPRE Int em
 * centavos (moneySchema).
 */

// ── Registro de visualização de produto (loja → API) ────────────────────────────

/** A loja manda só o slug; a API resolve o produto (escopo da loja, só ACTIVE). */
export const trackProductViewSchema = z.object({
  slug: z.string().min(1).max(200),
})

export type TrackProductViewInput = z.infer<typeof trackProductViewSchema>

// ── Registro de visita (loja → API) ─────────────────────────────────────────────

/**
 * De onde a visita veio. Lista fechada e curta de propósito: o card do painel
 * precisa de poucas barras legíveis, e o resto cai em `other`. A coluna no banco é
 * texto, então acrescentar uma origem não exige migration.
 */
export const VISIT_SOURCES = [
  'direct',
  'instagram',
  'facebook',
  'whatsapp',
  'tiktok',
  'pinterest',
  'google',
  'email',
  'other',
] as const
export const visitSourceSchema = z.enum(VISIT_SOURCES)
export type VisitSource = z.infer<typeof visitSourceSchema>

export const VISIT_DEVICES = ['mobile', 'desktop', 'tablet'] as const
export const visitDeviceSchema = z.enum(VISIT_DEVICES)
export type VisitDevice = z.infer<typeof visitDeviceSchema>

/**
 * O que a loja manda ao abrir uma sessão. Só o HOST do referrer, nunca a URL:
 * caminho e query de outro site podem carregar dado pessoal, e a origem só
 * precisa do domínio. O user-agent vem do cabeçalho, não do corpo.
 */
export const trackVisitSchema = z.object({
  referrerHost: z.string().max(253).optional(),
  utmSource: z.string().max(100).optional(),
  utmMedium: z.string().max(100).optional(),
})

export type TrackVisitInput = z.infer<typeof trackVisitSchema>

// ── Dashboard (admin) ───────────────────────────────────────────────────────────

/** Dia de calendário 'YYYY-MM-DD' — formato E data real. */
export const dayKeySchema = z.string().refine(isDayKey, { message: 'Data inválida (use AAAA-MM-DD)' })

export const granularitySchema = z.enum(GRANULARITIES)

/**
 * O admin resolve presets e comparação (o mesmo `date-range` dos dois lados) e
 * manda datas prontas: a API não precisa saber o que é "este mês". Sem
 * `granularity`, a API escolhe a automática para a duração.
 */
export const dashboardQuerySchema = z
  .object({
    from: dayKeySchema,
    to: dayKeySchema,
    compareFrom: dayKeySchema.optional(),
    compareTo: dayKeySchema.optional(),
    granularity: granularitySchema.optional(),
  })
  .superRefine((q, ctx) => {
    if (q.from > q.to) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'O início vem depois do fim' })
      return
    }
    const span = spanDays({ from: q.from, to: q.to })
    if (span > MAX_RANGE_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: `Período máximo de ${MAX_RANGE_DAYS} dias` })
    }

    if ((q.compareFrom === undefined) !== (q.compareTo === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['compareTo'], message: 'Comparação precisa de início e fim' })
    } else if (q.compareFrom !== undefined && q.compareTo !== undefined) {
      if (q.compareFrom > q.compareTo) {
        ctx.addIssue({ code: 'custom', path: ['compareFrom'], message: 'O início da comparação vem depois do fim' })
      } else if (spanDays({ from: q.compareFrom, to: q.compareTo }) > MAX_RANGE_DAYS) {
        ctx.addIssue({ code: 'custom', path: ['compareTo'], message: `Comparação máxima de ${MAX_RANGE_DAYS} dias` })
      }
    }

    if (q.granularity && !allowedGranularities(span).includes(q.granularity)) {
      ctx.addIssue({ code: 'custom', path: ['granularity'], message: 'Agrupamento indisponível para este período' })
    }
  })

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>

const count = z.number().int().nonnegative()
/** Razão de 0 a 1 (não percentual). `null` quando o denominador não existe. */
const rate = z.number().nonnegative().nullable()

/**
 * As métricas que viram tile e gráfico. `visits`/`conversionRate` são null antes
 * de existir contagem de visitas no período — mostrar 0 ali seria mentir.
 */
export const dashboardMetricsSchema = z.object({
  revenue: moneySchema,
  orders: count,
  averageTicket: moneySchema,
  visits: count.nullable(),
  conversionRate: rate,
})

/**
 * Um balde do gráfico. `key` é o início do balde no período atual ('YYYY-MM-DD',
 * ou 'YYYY-MM-DDTHH' por hora); `previousKey`, o início equivalente no período
 * comparado. `current` null = ainda não aconteceu (hora futura de hoje);
 * `previous` null = o comparado não tem dia correspondente.
 */
export const dashboardSeriesPointSchema = z.object({
  key: z.string(),
  previousKey: z.string().nullable(),
  current: dashboardMetricsSchema.nullable(),
  previous: dashboardMetricsSchema.nullable(),
})

/** Bruto → líquido. `discounts` inclui o desconto de frete grátis. */
export const revenueBreakdownSchema = z.object({
  grossSales: moneySchema,
  discounts: moneySchema,
  shipping: moneySchema,
  refunds: moneySchema,
  netRevenue: moneySchema,
})

/** Partição exata dos pedidos criados: created = paid + awaitingPayment + canceled. */
export const dashboardFunnelSchema = z.object({
  visits: count.nullable(),
  created: count,
  paid: count,
  awaitingPayment: count,
  canceled: count,
})

export const paymentMethodBreakdownSchema = z.object({
  /** null = venda sem pagamento registrado (pedido anterior ao provedor atual). */
  method: paymentMethodSchema.nullable(),
  orders: count,
  revenue: moneySchema,
})

export const dashboardTopCustomerSchema = z.object({
  customerId: z.string(),
  name: z.string(),
  orders: count,
  revenue: moneySchema,
  isNew: z.boolean(),
})

export const dashboardCustomersSchema = z.object({
  buyers: count,
  newBuyers: count,
  returningBuyers: count,
  signups: count,
  top: z.array(dashboardTopCustomerSchema),
})

export const dashboardTrafficSchema = z.object({
  bySource: z.array(z.object({ source: visitSourceSchema, visits: count })),
  byDevice: z.array(z.object({ device: visitDeviceSchema, visits: count })),
})

/**
 * Produto vendido e/ou visto no período. `revenue` é o valor dos itens, antes do
 * desconto do pedido (o desconto não é rateado por item). `productId` null só
 * para item cuja variante sumiu do catálogo.
 */
export const dashboardProductSchema = z.object({
  productId: z.string().nullable(),
  name: z.string(),
  slug: z.string().nullable(),
  imageUrl: z.string().nullable(),
  unitsSold: count,
  orders: count,
  revenue: moneySchema,
  views: count,
  conversionRate: rate,
})

export const dashboardCategorySchema = z.object({
  categoryId: z.string(),
  name: z.string(),
  unitsSold: count,
  orders: count,
  revenue: moneySchema,
})

export const dashboardStateSchema = z.object({
  state: z.string(),
  orders: count,
  revenue: moneySchema,
})

export const dashboardCouponSchema = z.object({
  code: z.string(),
  orders: count,
  discount: moneySchema,
  revenue: moneySchema,
})

export const dayRangeSchema = z.object({ from: z.string(), to: z.string() })

export const dashboardOverviewSchema = z.object({
  period: dayRangeSchema,
  /** `cutoffAt` (ISO): o período termina hoje, então o comparado foi cortado na mesma hora de agora. */
  comparison: dayRangeSchema.extend({ cutoffAt: z.string().nullable() }).nullable(),
  granularity: granularitySchema,
  /** Primeiro dia com visita registrada. Antes dele, visitas e conversão não existem. */
  trafficSince: z.string().nullable(),
  summary: z.object({
    current: dashboardMetricsSchema,
    previous: dashboardMetricsSchema.nullable(),
  }),
  series: z.array(dashboardSeriesPointSchema),
  revenueBreakdown: revenueBreakdownSchema,
  funnel: dashboardFunnelSchema,
  paymentMethods: z.array(paymentMethodBreakdownSchema),
  customers: dashboardCustomersSchema,
  traffic: dashboardTrafficSchema,
  products: z.array(dashboardProductSchema),
  categories: z.array(dashboardCategorySchema),
  states: z.array(dashboardStateSchema),
  coupons: z.array(dashboardCouponSchema),
})

export type DashboardMetrics = z.infer<typeof dashboardMetricsSchema>
export type DashboardSeriesPoint = z.infer<typeof dashboardSeriesPointSchema>
export type RevenueBreakdown = z.infer<typeof revenueBreakdownSchema>
export type DashboardFunnel = z.infer<typeof dashboardFunnelSchema>
export type PaymentMethodBreakdown = z.infer<typeof paymentMethodBreakdownSchema>
export type DashboardTopCustomer = z.infer<typeof dashboardTopCustomerSchema>
export type DashboardCustomers = z.infer<typeof dashboardCustomersSchema>
export type DashboardTraffic = z.infer<typeof dashboardTrafficSchema>
export type DashboardProduct = z.infer<typeof dashboardProductSchema>
export type DashboardCategory = z.infer<typeof dashboardCategorySchema>
export type DashboardState = z.infer<typeof dashboardStateSchema>
export type DashboardCoupon = z.infer<typeof dashboardCouponSchema>
export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>
