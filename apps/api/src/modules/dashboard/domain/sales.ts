import type { PaymentMethod, PaymentStatus } from '@ecommerce/shared/constants'
import {
  isSale,
  type DashboardCategory,
  type DashboardCoupon,
  type DashboardCustomers,
  type DashboardProduct,
  type DashboardState,
  type PaymentMethodBreakdown,
  type RevenueBreakdown,
} from '@ecommerce/shared/contracts'
import type { DayKey, DayRange } from '@ecommerce/shared/utils'

/**
 * As definições de venda do painel, por pedido e agregadas. Puro: recebe linhas
 * já lidas do banco. A régua de "o que é venda" é `isSale` (contracts), a mesma
 * do LTV na tela de clientes.
 */

export type PaymentRow = {
  method: PaymentMethod | null
  status: PaymentStatus
  refundedAmount: number
  paidAt: Date | null
}

export type ItemRow = {
  /** Via variante; null se a variante sumiu do catálogo. */
  productId: string | null
  productName: string
  quantity: number
  totalPrice: number
  imageUrl: string | null
}

export type OrderRow = {
  id: string
  createdAt: Date
  customerId: string
  paymentStatus: PaymentStatus
  canceledAt: Date | null
  subtotal: number
  discountTotal: number
  shippingTotal: number
  total: number
  couponCodeSnapshot: string | null
  /** UF do endereço de entrega, já validada. */
  state: string | null
  payments: PaymentRow[]
  items: ItemRow[]
}

/** Tentativas que chegaram a capturar dinheiro (mesmo que depois devolvido). */
const CAPTURED: readonly PaymentStatus[] = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']

/**
 * Quanto da venda voltou ao cliente. Só conta em pedido PARTIALLY_REFUNDED, e só
 * dos payments parcialmente reembolsados: num pagamento DUPLICADO estornado o
 * payment fica REFUNDED com o pedido ainda PAID — esse dinheiro nunca entrou na
 * receita, então não sai dela. O teto no total protege de dado incoerente.
 */
export const refundOf = (order: OrderRow): number => {
  if (order.paymentStatus !== 'PARTIALLY_REFUNDED') return 0
  const refunded = order.payments
    .filter((p) => p.status === 'PARTIALLY_REFUNDED')
    .reduce((sum, p) => sum + p.refundedAmount, 0)
  return Math.min(order.total, refunded)
}

export const netRevenueOf = (order: OrderRow): number => order.total - refundOf(order)

const paidTime = (p: PaymentRow): number => p.paidAt?.getTime() ?? Number.MAX_SAFE_INTEGER

/** O meio da tentativa que pagou primeiro — as recusadas e a duplicata não contam. */
export const saleMethodOf = (order: OrderRow): PaymentMethod | null => {
  const captured = order.payments.filter((p) => CAPTURED.includes(p.status))
  captured.sort((a, b) => paidTime(a) - paidTime(b))
  return captured[0]?.method ?? null
}

export type FunnelStatus = 'paid' | 'awaitingPayment' | 'canceled'

/**
 * Partição exata dos pedidos criados. Reembolsado por inteiro conta como
 * cancelado mesmo sem `canceledAt` (devolução depois da entrega): para o funil,
 * a venda não ficou.
 */
export const funnelStatusOf = (order: OrderRow): FunnelStatus => {
  if (order.canceledAt || order.paymentStatus === 'REFUNDED') return 'canceled'
  return isSale(order) ? 'paid' : 'awaitingPayment'
}

export const revenueBreakdownOf = (sales: OrderRow[]): RevenueBreakdown => {
  const breakdown: RevenueBreakdown = { grossSales: 0, discounts: 0, shipping: 0, refunds: 0, netRevenue: 0 }
  for (const order of sales) {
    const refund = refundOf(order)
    breakdown.grossSales += order.subtotal
    breakdown.discounts += order.discountTotal
    breakdown.shipping += order.shippingTotal
    breakdown.refunds += refund
    breakdown.netRevenue += order.total - refund
  }
  return breakdown
}

type Totals = { orders: number; revenue: number }

const groupTotals = <K>(sales: OrderRow[], keyOf: (order: OrderRow) => K | null): Map<K, Totals> => {
  const groups = new Map<K, Totals>()
  for (const order of sales) {
    const key = keyOf(order)
    if (key === null) continue
    const group = groups.get(key) ?? { orders: 0, revenue: 0 }
    group.orders += 1
    group.revenue += netRevenueOf(order)
    groups.set(key, group)
  }
  return groups
}

export const paymentMethodsOf = (sales: OrderRow[]): PaymentMethodBreakdown[] => {
  // Não usa `groupTotals`, que descarta a chave null: aqui "Não informado" é linha legítima.
  const groups = new Map<PaymentMethod | null, Totals>()
  for (const order of sales) {
    const method = saleMethodOf(order)
    const group = groups.get(method) ?? { orders: 0, revenue: 0 }
    group.orders += 1
    group.revenue += netRevenueOf(order)
    groups.set(method, group)
  }
  return [...groups]
    .map(([method, totals]) => ({ method, ...totals }))
    .sort((a, b) => b.revenue - a.revenue)
}

export const statesOf = (sales: OrderRow[]): DashboardState[] =>
  [...groupTotals(sales, (o) => o.state)]
    .map(([state, totals]) => ({ state, ...totals }))
    .sort((a, b) => b.revenue - a.revenue)

export const couponsOf = (sales: OrderRow[]): DashboardCoupon[] => {
  const groups = new Map<string, DashboardCoupon>()
  for (const order of sales) {
    if (!order.couponCodeSnapshot) continue
    const code = order.couponCodeSnapshot
    const group = groups.get(code) ?? { code, orders: 0, discount: 0, revenue: 0 }
    group.orders += 1
    group.discount += order.discountTotal
    group.revenue += netRevenueOf(order)
    groups.set(code, group)
  }
  return [...groups.values()].sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
}

/**
 * Novo = a 1ª venda da vida do cliente caiu dentro do período. `firstSaleDay`
 * vem do banco sem filtro de período — é isso que separa quem voltou de quem
 * chegou. Sem a entrada no mapa (não deveria acontecer), conta como novo.
 */
export const customersOf = (
  sales: OrderRow[],
  period: DayRange,
  firstSaleDay: Map<string, DayKey>,
  names: Map<string, string>,
  signups: number,
): DashboardCustomers => {
  const byCustomer = groupTotals(sales, (o) => o.customerId)
  const isNew = (customerId: string): boolean => (firstSaleDay.get(customerId) ?? period.from) >= period.from

  let newBuyers = 0
  for (const customerId of byCustomer.keys()) if (isNew(customerId)) newBuyers += 1

  const top = [...byCustomer]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([customerId, totals]) => ({
      customerId,
      name: names.get(customerId) ?? 'Cliente',
      ...totals,
      isNew: isNew(customerId),
    }))

  return {
    buyers: byCustomer.size,
    newBuyers,
    returningBuyers: byCustomer.size - newBuyers,
    signups,
    top,
  }
}

export type CatalogEntry = { name: string; slug: string; imageUrl: string | null }
export type CategoryRef = { id: string; name: string }

/** Teto da lista: o card mostra dez e expande; cinquenta cobrem o catálogo da loja. */
const MAX_PRODUCTS = 50

type ProductAcc = Omit<DashboardProduct, 'orders' | 'conversionRate'> & { orderIds: Set<string> }

/**
 * Vendidos E vistos na mesma lista: "muito visto e pouco vendido" é o achado que
 * pede ação (preço, foto, descrição), e duas listas separadas escondem isso.
 *
 * Agrupa pelo PRODUTO, não pelo nome gravado no pedido — renomear não parte a
 * linha em duas. `revenue` é o valor dos itens, antes do desconto do pedido.
 */
export const productsOf = (
  sales: OrderRow[],
  catalog: Map<string, CatalogEntry>,
  viewsByProduct: Map<string, number>,
): DashboardProduct[] => {
  const groups = new Map<string, ProductAcc>()
  const accFor = (key: string, productId: string | null, fallbackName: string, fallbackImage: string | null) => {
    let acc = groups.get(key)
    if (!acc) {
      const entry = productId ? catalog.get(productId) : undefined
      acc = {
        productId,
        name: entry?.name ?? fallbackName,
        slug: entry?.slug ?? null,
        imageUrl: entry?.imageUrl ?? fallbackImage,
        unitsSold: 0,
        revenue: 0,
        views: productId ? (viewsByProduct.get(productId) ?? 0) : 0,
        orderIds: new Set(),
      }
      groups.set(key, acc)
    }
    return acc
  }

  for (const order of sales) {
    for (const item of order.items) {
      const key = item.productId ?? `nome:${item.productName}`
      const acc = accFor(key, item.productId, item.productName, item.imageUrl)
      acc.unitsSold += item.quantity
      acc.revenue += item.totalPrice
      acc.orderIds.add(order.id)
    }
  }

  for (const productId of viewsByProduct.keys()) {
    const entry = catalog.get(productId)
    // Visualização de produto já apagado do catálogo não tem o que mostrar.
    if (entry) accFor(productId, productId, entry.name, entry.imageUrl)
  }

  return [...groups.values()]
    .map(({ orderIds, ...acc }) => ({
      ...acc,
      orders: orderIds.size,
      conversionRate: acc.views > 0 ? orderIds.size / acc.views : null,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.views - a.views)
    .slice(0, MAX_PRODUCTS)
}

/**
 * Um produto em duas categorias soma nas duas — é a pergunta "quanto vende a
 * categoria X", não uma partição da receita. O card avisa.
 */
export const categoriesOf = (sales: OrderRow[], categoriesByProduct: Map<string, CategoryRef[]>): DashboardCategory[] => {
  const groups = new Map<string, Omit<DashboardCategory, 'orders'> & { orderIds: Set<string> }>()
  for (const order of sales) {
    for (const item of order.items) {
      if (!item.productId) continue
      for (const category of categoriesByProduct.get(item.productId) ?? []) {
        const acc = groups.get(category.id) ?? {
          categoryId: category.id,
          name: category.name,
          unitsSold: 0,
          revenue: 0,
          orderIds: new Set<string>(),
        }
        acc.unitsSold += item.quantity
        acc.revenue += item.totalPrice
        acc.orderIds.add(order.id)
        groups.set(category.id, acc)
      }
    }
  }
  return [...groups.values()]
    .map(({ orderIds, ...acc }) => ({ ...acc, orders: orderIds.size }))
    .sort((a, b) => b.revenue - a.revenue)
}
