import { z } from 'zod'
import { moneySchema } from './common.js'

/**
 * Contratos de analytics: o registro de visita (público, disparado pela loja) e o
 * dashboard do admin (agregações de venda + produtos mais visitados). Valores
 * monetários são SEMPRE Int em centavos (moneySchema).
 */

// ── Registro de visita (loja → API) ─────────────────────────────────────────────

/** A loja manda só o slug; a API resolve o produto (escopo da loja, só ACTIVE). */
export const trackProductViewSchema = z.object({
  slug: z.string().min(1).max(200),
})

export type TrackProductViewInput = z.infer<typeof trackProductViewSchema>

// ── Dashboard (admin) ───────────────────────────────────────────────────────────

/** Período do dashboard. Enum fechado: o service converte em intervalo de datas. */
export const dashboardRangeSchema = z.enum(['7d', '30d', '90d'])
export type DashboardRange = z.infer<typeof dashboardRangeSchema>

export const dashboardQuerySchema = z.object({
  range: dashboardRangeSchema.default('30d'),
})

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>

/** KPIs do topo. Receita e ticket médio em centavos; o resto é contagem. */
export const dashboardSummarySchema = z.object({
  revenue: moneySchema,
  orders: z.number().int().nonnegative(),
  averageTicket: moneySchema,
  itemsSold: z.number().int().nonnegative(),
  pendingOrders: z.number().int().nonnegative(),
})

/** Um ponto da série diária de vendas. `date` é YYYY-MM-DD. */
export const salesPointSchema = z.object({
  date: z.string(),
  revenue: moneySchema,
  orders: z.number().int().nonnegative(),
})

export const topProductSchema = z.object({
  productName: z.string(),
  unitsSold: z.number().int().nonnegative(),
  revenue: moneySchema,
})

export const topViewedSchema = z.object({
  productId: z.string(),
  name: z.string(),
  slug: z.string(),
  views: z.number().int().nonnegative(),
})

export const dashboardOverviewSchema = z.object({
  range: dashboardRangeSchema,
  summary: dashboardSummarySchema,
  salesSeries: z.array(salesPointSchema),
  topProducts: z.array(topProductSchema),
  topViewed: z.array(topViewedSchema),
})

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>
export type SalesPoint = z.infer<typeof salesPointSchema>
export type TopProduct = z.infer<typeof topProductSchema>
export type TopViewed = z.infer<typeof topViewedSchema>
export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>
