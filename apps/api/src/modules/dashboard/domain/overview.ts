import {
  isSale,
  VISIT_DEVICES,
  VISIT_SOURCES,
  type DashboardMetrics,
  type DashboardOverview,
  type DashboardSeriesPoint,
  type DashboardTraffic,
  type VisitDevice,
  type VisitSource,
} from '@ecommerce/shared/contracts'
import { spDayKey, spHourKey, type DayKey, type DayRange, type Granularity } from '@ecommerce/shared/utils'
import { buildFrame, comparisonCutoff, projectToCurrent } from './series.js'
import {
  categoriesOf,
  couponsOf,
  customersOf,
  funnelStatusOf,
  netRevenueOf,
  paymentMethodsOf,
  productsOf,
  revenueBreakdownOf,
  statesOf,
  type CatalogEntry,
  type CategoryRef,
  type OrderRow,
} from './sales.js'

/** Visitas de uma hora (rollup do StoreVisit somado por dia + hora). */
export type VisitRow = { date: DayKey; hour: number; count: number }

export type TrafficRow = { source: string; device: string; count: number }

export type OverviewInput = {
  now: Date
  today: DayKey
  period: DayRange
  comparison: DayRange | null
  granularity: Granularity
  /** Todos os pedidos CRIADOS no período, de qualquer status, com itens. */
  orders: OrderRow[]
  /** Idem no comparado (sem itens). O corte de "hoje" é aplicado aqui dentro. */
  comparisonOrders: OrderRow[]
  visits: VisitRow[]
  comparisonVisits: VisitRow[]
  trafficSince: DayKey | null
  traffic: TrafficRow[]
  signups: number
  firstSaleDay: Map<string, DayKey>
  customerNames: Map<string, string>
  catalog: Map<string, CatalogEntry>
  categoriesByProduct: Map<string, CategoryRef[]>
  viewsByProduct: Map<string, number>
}

type Acc = { revenue: number; orders: number; salesSinceTraffic: number; visits: number }

const emptyAcc = (): Acc => ({ revenue: 0, orders: 0, salesSinceTraffic: 0, visits: 0 })

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * Visitas só existem a partir do primeiro dia contado. Antes disso o número é
 * desconhecido — null, não zero —, e a conversão também.
 */
const toMetrics = (acc: Acc, lastDay: DayKey | null, trafficSince: DayKey | null): DashboardMetrics => {
  const visitsKnown = trafficSince !== null && lastDay !== null && lastDay >= trafficSince
  const visits = visitsKnown ? acc.visits : null
  return {
    revenue: acc.revenue,
    orders: acc.orders,
    averageTicket: acc.orders > 0 ? Math.round(acc.revenue / acc.orders) : 0,
    visits,
    // Só as vendas de dias com visita contada: dividir vendas de antes da
    // contagem pelas visitas de depois inflaria a taxa.
    conversionRate: visits ? acc.salesSinceTraffic / visits : null,
  }
}

const addSale = (acc: Acc, order: OrderRow, trafficSince: DayKey | null): void => {
  acc.revenue += netRevenueOf(order)
  acc.orders += 1
  if (trafficSince !== null && spDayKey(order.createdAt) >= trafficSince) acc.salesSinceTraffic += 1
}

const totalsOf = (sales: OrderRow[], visits: VisitRow[], range: DayRange, trafficSince: DayKey | null) => {
  const acc = emptyAcc()
  for (const order of sales) addSale(acc, order, trafficSince)
  for (const visit of visits) acc.visits += visit.count
  return toMetrics(acc, range.to, trafficSince)
}

const isSource = (value: string): value is VisitSource => (VISIT_SOURCES as readonly string[]).includes(value)
const isDevice = (value: string): value is VisitDevice => (VISIT_DEVICES as readonly string[]).includes(value)

const trafficOf = (rows: TrafficRow[]): DashboardTraffic => {
  const bySource = new Map<VisitSource, number>()
  const byDevice = new Map<VisitDevice, number>()
  for (const row of rows) {
    const source = isSource(row.source) ? row.source : 'other'
    bySource.set(source, (bySource.get(source) ?? 0) + row.count)
    if (isDevice(row.device)) byDevice.set(row.device, (byDevice.get(row.device) ?? 0) + row.count)
  }
  return {
    bySource: [...bySource].map(([source, visits]) => ({ source, visits })).sort((a, b) => b.visits - a.visits),
    byDevice: [...byDevice].map(([device, visits]) => ({ device, visits })).sort((a, b) => b.visits - a.visits),
  }
}

export const buildOverview = (input: OverviewInput): DashboardOverview => {
  const { period, comparison, granularity, trafficSince, now, today } = input
  const frame = buildFrame(period, comparison, granularity)

  const sales = input.orders.filter(isSale)
  const comparisonSales = input.comparisonOrders.filter(isSale)

  // ── Totais (tiles) ──
  const cutoffAt = comparisonCutoff(period, comparison, today, now)
  const cutoffHourKey = cutoffAt ? spHourKey(cutoffAt) : null
  const beforeCutoff = (visit: VisitRow): boolean =>
    cutoffHourKey === null || `${visit.date}T${pad2(visit.hour)}` <= cutoffHourKey

  const current = totalsOf(sales, input.visits, period, trafficSince)
  const previous = comparison
    ? totalsOf(
        cutoffAt ? comparisonSales.filter((o) => o.createdAt <= cutoffAt) : comparisonSales,
        input.comparisonVisits.filter(beforeCutoff),
        comparison,
        trafficSince,
      )
    : null

  // ── Série (gráfico) — o comparado vai inteiro, sem o corte: é a referência ──
  const positionOf = (instant: Date): string => (granularity === 'hour' ? spHourKey(instant) : spDayKey(instant))
  const visitPosition = (visit: VisitRow): string =>
    granularity === 'hour' ? `${visit.date}T${pad2(visit.hour)}` : visit.date

  const currentAcc = frame.keys.map(emptyAcc)
  const previousAcc = frame.keys.map(emptyAcc)

  for (const order of sales) {
    const i = frame.indexOf(positionOf(order.createdAt))
    if (i !== null) addSale(currentAcc[i]!, order, trafficSince)
  }
  for (const visit of input.visits) {
    const i = frame.indexOf(visitPosition(visit))
    if (i !== null) currentAcc[i]!.visits += visit.count
  }
  if (comparison) {
    for (const order of comparisonSales) {
      const projected = projectToCurrent(positionOf(order.createdAt), period, comparison)
      const i = projected === null ? null : frame.indexOf(projected)
      if (i !== null) addSale(previousAcc[i]!, order, trafficSince)
    }
    for (const visit of input.comparisonVisits) {
      const projected = projectToCurrent(visitPosition(visit), period, comparison)
      const i = projected === null ? null : frame.indexOf(projected)
      if (i !== null) previousAcc[i]!.visits += visit.count
    }
  }

  // Balde que ainda não começou (hora futura de hoje) é null: a linha para em
  // "agora", em vez de despencar para zero.
  const nowKey = granularity === 'hour' ? spHourKey(now) : today
  const series: DashboardSeriesPoint[] = frame.keys.map((key, i) => ({
    key,
    previousKey: frame.previousKeys[i] ?? null,
    current: key > nowKey ? null : toMetrics(currentAcc[i]!, frame.lastDays[i]!, trafficSince),
    previous:
      frame.previousKeys[i] === null
        ? null
        : toMetrics(previousAcc[i]!, frame.previousLastDays[i] ?? null, trafficSince),
  }))

  // ── Funil (todos os pedidos criados) ──
  const funnel = { visits: current.visits, created: input.orders.length, paid: 0, awaitingPayment: 0, canceled: 0 }
  for (const order of input.orders) funnel[funnelStatusOf(order)] += 1

  return {
    period,
    comparison: comparison ? { ...comparison, cutoffAt: cutoffAt?.toISOString() ?? null } : null,
    granularity,
    trafficSince,
    summary: { current, previous },
    series,
    revenueBreakdown: revenueBreakdownOf(sales),
    funnel,
    paymentMethods: paymentMethodsOf(sales),
    customers: customersOf(sales, period, input.firstSaleDay, input.customerNames, input.signups),
    traffic: trafficOf(input.traffic),
    products: productsOf(sales, input.catalog, input.viewsByProduct),
    categories: categoriesOf(sales, input.categoriesByProduct),
    states: statesOf(sales),
    coupons: couponsOf(sales),
  }
}
