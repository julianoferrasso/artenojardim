import type {
  DashboardQuery,
  DashboardOverview,
  SalesPoint,
  TopProduct,
  TopViewed,
} from '@ecommerce/shared/contracts'
import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'

const DAYS_BY_RANGE: Record<DashboardQuery['range'], number> = { '7d': 7, '30d': 30, '90d': 90 }

/** YYYY-MM-DD em UTC — a chave de bucket da série diária. */
const dayKey = (d: Date): string => d.toISOString().slice(0, 10)

/**
 * Overview do painel: KPIs de venda, série diária, top vendidos e top visitados.
 * Tudo escopado por loja e restrito a pedidos PAGOS (o webhook do Stripe é a
 * fonte da verdade do pagamento). Dinheiro em centavos, do banco — o front nunca
 * recalcula.
 */
export const getOverview = async (query: DashboardQuery): Promise<DashboardOverview> => {
  const storeId = getActiveStoreId()
  const days = DAYS_BY_RANGE[query.range]

  // Início do intervalo: começo (UTC) do dia N-1 atrás, para incluir hoje.
  const from = new Date()
  from.setUTCHours(0, 0, 0, 0)
  from.setUTCDate(from.getUTCDate() - (days - 1))

  const paidWhere = {
    storeId,
    paymentStatus: 'PAID' as const,
    createdAt: { gte: from },
  }

  const [agg, pendingOrders, paidOrders, groupedItems, groupedViews] = await Promise.all([
    prisma.order.aggregate({ where: paidWhere, _sum: { total: true }, _count: true }),
    prisma.order.count({ where: { storeId, paymentStatus: 'PENDING' } }),
    prisma.order.findMany({ where: paidWhere, select: { createdAt: true, total: true } }),
    prisma.orderItem.groupBy({
      by: ['productName'],
      where: { order: paidWhere },
      _sum: { quantity: true, totalPrice: true },
    }),
    prisma.productView.groupBy({
      by: ['productId'],
      where: { storeId, date: { gte: from } },
      _sum: { count: true },
    }),
  ])

  const revenue = agg._sum.total ?? 0
  const orders = agg._count
  const itemsSold = groupedItems.reduce((acc, g) => acc + (g._sum.quantity ?? 0), 0)

  // Série diária: começa com todos os dias em zero, depois preenche. Assim o
  // gráfico não some com dias sem venda — mostra o vale, que é informação.
  const series = new Map<string, SalesPoint>()
  for (let i = 0; i < days; i++) {
    const d = new Date(from)
    d.setUTCDate(from.getUTCDate() + i)
    series.set(dayKey(d), { date: dayKey(d), revenue: 0, orders: 0 })
  }
  for (const o of paidOrders) {
    const point = series.get(dayKey(o.createdAt))
    if (point) {
      point.revenue += o.total
      point.orders += 1
    }
  }

  const topProducts: TopProduct[] = groupedItems
    .map((g) => ({
      productName: g.productName,
      unitsSold: g._sum.quantity ?? 0,
      revenue: g._sum.totalPrice ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Nomes/slugs dos produtos visitados numa query só; visitas de um produto já
  // apagado (id sem match) simplesmente saem da lista.
  const viewedIds = groupedViews.map((g) => g.productId)
  const products =
    viewedIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: viewedIds }, storeId },
          select: { id: true, name: true, slug: true },
        })
      : []
  const productById = new Map(products.map((p) => [p.id, p]))

  const topViewed: TopViewed[] = groupedViews
    .map((g) => {
      const p = productById.get(g.productId)
      return p ? { productId: p.id, name: p.name, slug: p.slug, views: g._sum.count ?? 0 } : null
    })
    .filter((v): v is TopViewed => v !== null)
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)

  return {
    range: query.range,
    summary: {
      revenue,
      orders,
      averageTicket: orders > 0 ? Math.round(revenue / orders) : 0,
      itemsSold,
      pendingOrders,
    },
    salesSeries: [...series.values()],
    topProducts,
    topViewed,
  }
}
