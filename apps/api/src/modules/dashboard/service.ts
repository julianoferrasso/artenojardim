import type { Prisma } from '@prisma/client'
import {
  isSale,
  SALE_PAYMENT_STATUSES,
  type DashboardOverview,
  type DashboardQuery,
} from '@ecommerce/shared/contracts'
import { BR_STATE_CODES } from '@ecommerce/shared/constants'
import {
  allowedGranularities,
  autoGranularity,
  spanDays,
  spDayAsDateColumn,
  spDayEnd,
  spDayKey,
  spDayStart,
  type DayKey,
  type DayRange,
} from '@ecommerce/shared/utils'
import { prisma } from '../../config/prisma.js'
import { logger } from '../../config/logger.js'
import { storage } from '../../integrations/storage/index.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { buildOverview, type VisitRow } from './domain/overview.js'
import type { CatalogEntry, CategoryRef, OrderRow } from './domain/sales.js'

/**
 * Overview do painel: lê as linhas cruas do período (e do comparado) e entrega ao
 * `domain/`, que faz toda a conta. Consulta ao vivo de propósito — a loja é
 * pequena e o número precisa estar fresco; o `DailyMetric` por job só entra
 * quando isto passar de 2 s (docs/arquitetura.md, apêndice).
 */

/** Abaixo do gatilho de 2 s, para o aviso chegar antes do problema. */
const SLOW_MS = 1500

const PAYMENT_SELECT = {
  method: true,
  status: true,
  refundedAmount: true,
  paidAt: true,
} satisfies Prisma.PaymentSelect

const ORDER_SELECT = {
  id: true,
  createdAt: true,
  customerId: true,
  paymentStatus: true,
  canceledAt: true,
  subtotal: true,
  discountTotal: true,
  shippingTotal: true,
  total: true,
  couponCodeSnapshot: true,
  // Só a UF é lida; o JSON vem inteiro porque o Prisma não seleciona dentro dele.
  shippingAddressJson: true,
  payments: { select: PAYMENT_SELECT },
} satisfies Prisma.OrderSelect

const ORDER_WITH_ITEMS_SELECT = {
  ...ORDER_SELECT,
  items: {
    select: {
      productName: true,
      quantity: true,
      totalPrice: true,
      imageUrl: true,
      // O pedido não guarda productId: o produto vem pela variante, e é por ele
      // (não pelo nome copiado) que o ranking agrupa.
      variant: { select: { productId: true } },
    },
  },
} satisfies Prisma.OrderSelect

type OrderPayload = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>
type OrderWithItemsPayload = Prisma.OrderGetPayload<{ select: typeof ORDER_WITH_ITEMS_SELECT }>

const PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  // Mesma capa do catálogo do admin: a foto do produto antes da de variação.
  images: {
    orderBy: [{ variantId: { sort: 'asc', nulls: 'first' } }, { position: 'asc' }],
    take: 1,
    select: { upload: { select: { key: true } } },
  },
  categories: { select: { category: { select: { id: true, name: true } } } },
} satisfies Prisma.ProductSelect

const instantRange = (range: DayRange) => ({ gte: spDayStart(range.from), lte: spDayEnd(range.to) })

/** Coluna @db.Date: o dia vai como meia-noite UTC, não como o instante em que o dia começa. */
const dateColumnRange = (range: DayRange) => ({
  gte: spDayAsDateColumn(range.from),
  lte: spDayAsDateColumn(range.to),
})

const stateOf = (address: Prisma.JsonValue): string | null => {
  if (!address || typeof address !== 'object' || Array.isArray(address)) return null
  const state = address['state']
  if (typeof state !== 'string') return null
  const uf = state.trim().toUpperCase()
  return (BR_STATE_CODES as readonly string[]).includes(uf) ? uf : null
}

const toOrderRow = (row: OrderPayload & { items?: OrderWithItemsPayload['items'] }): OrderRow => ({
  id: row.id,
  createdAt: row.createdAt,
  customerId: row.customerId,
  paymentStatus: row.paymentStatus,
  canceledAt: row.canceledAt,
  subtotal: row.subtotal,
  discountTotal: row.discountTotal,
  shippingTotal: row.shippingTotal,
  total: row.total,
  couponCodeSnapshot: row.couponCodeSnapshot,
  state: stateOf(row.shippingAddressJson),
  payments: row.payments,
  items: (row.items ?? []).map((item) => ({
    productId: item.variant?.productId ?? null,
    productName: item.productName,
    quantity: item.quantity,
    totalPrice: item.totalPrice,
    imageUrl: item.imageUrl,
  })),
})

const findOrders = async (storeId: string, range: DayRange, withItems: boolean): Promise<OrderRow[]> => {
  const where = { storeId, createdAt: instantRange(range) }
  const rows = withItems
    ? await prisma.order.findMany({ where, select: ORDER_WITH_ITEMS_SELECT, orderBy: { createdAt: 'asc' } })
    : await prisma.order.findMany({ where, select: ORDER_SELECT, orderBy: { createdAt: 'asc' } })
  return rows.map(toOrderRow)
}

const findVisits = async (storeId: string, range: DayRange): Promise<VisitRow[]> => {
  const rows = await prisma.storeVisit.groupBy({
    by: ['date', 'hour'],
    where: { storeId, date: dateColumnRange(range) },
    _sum: { count: true },
  })
  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    hour: row.hour,
    count: row._sum.count ?? 0,
  }))
}

export const getOverview = async (query: DashboardQuery): Promise<DashboardOverview> => {
  const startedAt = performance.now()
  const storeId = getActiveStoreId()
  const now = new Date()
  const today = spDayKey(now)

  // O futuro não tem venda nem visita: o período para em hoje.
  const to = query.to > today ? today : query.to
  const from = query.from > to ? to : query.from
  const period: DayRange = { from, to }
  const comparison: DayRange | null =
    query.compareFrom && query.compareTo ? { from: query.compareFrom, to: query.compareTo } : null

  // O clamp em hoje pode encurtar o período a ponto de o agrupamento pedido não
  // caber mais (semana num período que virou 3 dias): volta ao automático.
  const span = spanDays(period)
  const granularity =
    query.granularity && allowedGranularities(span).includes(query.granularity)
      ? query.granularity
      : autoGranularity(span)

  const [orders, comparisonOrders, visits, comparisonVisits, trafficRows, firstVisit, signups, views] =
    await Promise.all([
      findOrders(storeId, period, true),
      comparison ? findOrders(storeId, comparison, false) : Promise.resolve([]),
      findVisits(storeId, period),
      comparison ? findVisits(storeId, comparison) : Promise.resolve([]),
      prisma.storeVisit.groupBy({
        by: ['source', 'device'],
        where: { storeId, date: dateColumnRange(period) },
        _sum: { count: true },
      }),
      prisma.storeVisit.findFirst({ where: { storeId }, orderBy: { date: 'asc' }, select: { date: true } }),
      prisma.customer.count({ where: { storeId, createdAt: instantRange(period) } }),
      // `lte` também: sem ele, um período no passado contaria visualizações até hoje.
      prisma.productView.groupBy({
        by: ['productId'],
        where: { storeId, date: dateColumnRange(period) },
        _sum: { count: true },
      }),
    ])

  const buyerIds = [...new Set(orders.filter(isSale).map((o) => o.customerId))]
  const viewsByProduct = new Map(views.map((v) => [v.productId, v._sum.count ?? 0]))
  const productIds = [
    ...new Set([
      ...orders.flatMap((o) => o.items.map((i) => i.productId)).filter((id): id is string => id !== null),
      ...viewsByProduct.keys(),
    ]),
  ]

  const [firstSales, customers, products] = await Promise.all([
    // A 1ª venda da VIDA de cada comprador, sem recorte de período: é o que
    // separa cliente novo de recorrente.
    buyerIds.length > 0
      ? prisma.order.groupBy({
          by: ['customerId'],
          where: {
            storeId,
            customerId: { in: buyerIds },
            canceledAt: null,
            paymentStatus: { in: [...SALE_PAYMENT_STATUSES] },
          },
          _min: { createdAt: true },
        })
      : Promise.resolve([]),
    buyerIds.length > 0
      ? prisma.customer.findMany({ where: { storeId, id: { in: buyerIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    productIds.length > 0
      ? prisma.product.findMany({ where: { storeId, id: { in: productIds } }, select: PRODUCT_SELECT })
      : Promise.resolve([]),
  ])

  const firstSaleDay = new Map<string, DayKey>()
  for (const row of firstSales) {
    if (row._min.createdAt) firstSaleDay.set(row.customerId, spDayKey(row._min.createdAt))
  }

  const catalog = new Map<string, CatalogEntry>()
  const categoriesByProduct = new Map<string, CategoryRef[]>()
  for (const product of products) {
    const cover = product.images[0]
    catalog.set(product.id, {
      name: product.name,
      slug: product.slug,
      imageUrl: cover ? storage().getPublicUrl(cover.upload.key) : null,
    })
    categoriesByProduct.set(
      product.id,
      product.categories.map((c) => ({ id: c.category.id, name: c.category.name })),
    )
  }

  const overview = buildOverview({
    now,
    today,
    period,
    comparison,
    granularity,
    orders,
    comparisonOrders,
    visits,
    comparisonVisits,
    trafficSince: firstVisit ? firstVisit.date.toISOString().slice(0, 10) : null,
    traffic: trafficRows.map((row) => ({ source: row.source, device: row.device, count: row._sum.count ?? 0 })),
    signups,
    firstSaleDay,
    customerNames: new Map(customers.map((c) => [c.id, c.name])),
    catalog,
    categoriesByProduct,
    viewsByProduct,
  })

  const elapsedMs = Math.round(performance.now() - startedAt)
  if (elapsedMs > SLOW_MS) {
    logger.warn({ elapsedMs, period, granularity }, 'dashboard lento: hora de considerar o DailyMetric')
  }

  return overview
}
