import { describe, it, expect } from 'vitest'
import { isSale } from '@ecommerce/shared/contracts'
import {
  categoriesOf,
  couponsOf,
  customersOf,
  funnelStatusOf,
  netRevenueOf,
  paymentMethodsOf,
  productsOf,
  refundOf,
  revenueBreakdownOf,
  saleMethodOf,
  statesOf,
  type OrderRow,
  type PaymentRow,
} from '../src/modules/dashboard/domain/sales.js'

/**
 * As definições de venda do painel. É aqui que "quanto eu vendi" vira número —
 * e onde o painel antigo errava: o reembolso parcial tirava o pedido inteiro.
 */

let seq = 0
const paid = (over: Partial<PaymentRow> = {}): PaymentRow => ({
  method: 'PIX',
  status: 'PAID',
  refundedAmount: 0,
  paidAt: new Date('2026-10-20T15:05:00.000Z'),
  ...over,
})

const order = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: `o${++seq}`,
  createdAt: new Date('2026-10-20T15:00:00.000Z'),
  customerId: 'c1',
  paymentStatus: 'PAID',
  canceledAt: null,
  subtotal: 10000,
  discountTotal: 0,
  shippingTotal: 0,
  total: 10000,
  couponCodeSnapshot: null,
  state: 'SP',
  payments: [paid()],
  items: [],
  ...over,
})

describe('isSale', () => {
  it('pago e parcialmente reembolsado são venda; cancelado não, mesmo pago', () => {
    expect(isSale(order({ paymentStatus: 'PAID' }))).toBe(true)
    expect(isSale(order({ paymentStatus: 'PARTIALLY_REFUNDED' }))).toBe(true)
    expect(isSale(order({ paymentStatus: 'PAID', canceledAt: new Date() }))).toBe(false)
    expect(isSale(order({ paymentStatus: 'REFUNDED' }))).toBe(false)
    expect(isSale(order({ paymentStatus: 'PENDING' }))).toBe(false)
    expect(isSale(order({ paymentStatus: 'PROCESSING' }))).toBe(false)
    expect(isSale(order({ paymentStatus: 'FAILED' }))).toBe(false)
  })
})

describe('receita líquida', () => {
  it('pedido pago vale o total', () => {
    expect(netRevenueOf(order())).toBe(10000)
  })

  it('reembolso parcial desconta só o que voltou — o pedido continua na receita', () => {
    const o = order({
      paymentStatus: 'PARTIALLY_REFUNDED',
      payments: [paid({ status: 'PARTIALLY_REFUNDED', refundedAmount: 3000 })],
    })
    expect(refundOf(o)).toBe(3000)
    expect(netRevenueOf(o)).toBe(7000)
  })

  it('a duplicata estornada não reduz a receita: aquele dinheiro nunca entrou', () => {
    const o = order({
      paymentStatus: 'PAID',
      payments: [paid(), paid({ status: 'REFUNDED', refundedAmount: 10000 })],
    })
    expect(netRevenueOf(o)).toBe(10000)
  })

  it('reembolso maior que o total (dado incoerente) não deixa a receita negativa', () => {
    const o = order({
      paymentStatus: 'PARTIALLY_REFUNDED',
      payments: [paid({ status: 'PARTIALLY_REFUNDED', refundedAmount: 15000 })],
    })
    expect(netRevenueOf(o)).toBe(0)
  })

  it('a composição fecha: bruto − descontos + frete − reembolsos = líquida', () => {
    const sales = [
      order({ subtotal: 12000, discountTotal: 2000, shippingTotal: 1500, total: 11500 }),
      order({
        subtotal: 8000,
        discountTotal: 0,
        shippingTotal: 2000,
        total: 10000,
        paymentStatus: 'PARTIALLY_REFUNDED',
        payments: [paid({ status: 'PARTIALLY_REFUNDED', refundedAmount: 2500 })],
      }),
    ]
    const b = revenueBreakdownOf(sales)
    expect(b).toEqual({ grossSales: 20000, discounts: 2000, shipping: 3500, refunds: 2500, netRevenue: 19000 })
    expect(b.grossSales - b.discounts + b.shipping - b.refunds).toBe(b.netRevenue)
  })
})

describe('meio de pagamento da venda', () => {
  it('é o da tentativa que pagou primeiro; recusas e duplicatas não contam', () => {
    const o = order({
      payments: [
        paid({ method: 'CARD', status: 'FAILED', paidAt: null }),
        paid({ method: 'PIX', paidAt: new Date('2026-10-20T15:10:00.000Z') }),
        paid({ method: 'CARD', paidAt: new Date('2026-10-20T15:20:00.000Z') }),
      ],
    })
    expect(saleMethodOf(o)).toBe('PIX')
  })

  it('sem pagamento capturado o meio é desconhecido', () => {
    expect(saleMethodOf(order({ payments: [] }))).toBeNull()
  })

  it('agrupa por meio, com a venda sem pagamento como linha própria', () => {
    const rows = paymentMethodsOf([
      order({ payments: [paid({ method: 'CARD' })], total: 30000 }),
      order({ payments: [paid({ method: 'PIX' })] }),
      order({ payments: [paid({ method: 'PIX' })] }),
      order({ payments: [] }),
    ])
    expect(rows).toEqual([
      { method: 'CARD', orders: 1, revenue: 30000 },
      { method: 'PIX', orders: 2, revenue: 20000 },
      { method: null, orders: 1, revenue: 10000 },
    ])
  })
})

describe('funil', () => {
  it('é uma partição exata dos pedidos criados', () => {
    const orders = [
      order(),
      order({ paymentStatus: 'PARTIALLY_REFUNDED' }),
      order({ paymentStatus: 'PENDING', payments: [] }),
      order({ paymentStatus: 'PAID', canceledAt: new Date() }),
      order({ paymentStatus: 'REFUNDED' }),
    ]
    const counts = { paid: 0, awaitingPayment: 0, canceled: 0 }
    for (const o of orders) counts[funnelStatusOf(o)] += 1
    expect(counts).toEqual({ paid: 2, awaitingPayment: 1, canceled: 2 })
  })
})

describe('quebras', () => {
  it('estados e cupons agrupam a receita líquida', () => {
    const sales = [
      order({ state: 'SP', couponCodeSnapshot: 'BEMVINDA', discountTotal: 1000, subtotal: 11000 }),
      order({ state: 'SP' }),
      order({ state: 'RJ', total: 25000, subtotal: 25000, couponCodeSnapshot: 'BEMVINDA', discountTotal: 500 }),
      order({ state: null }),
    ]
    expect(statesOf(sales)).toEqual([
      { state: 'RJ', orders: 1, revenue: 25000 },
      { state: 'SP', orders: 2, revenue: 20000 },
    ])
    expect(couponsOf(sales)).toEqual([{ code: 'BEMVINDA', orders: 2, discount: 1500, revenue: 35000 }])
  })

  it('cliente novo é quem fez a 1ª compra da vida dentro do período', () => {
    const sales = [
      order({ customerId: 'ana', total: 5000 }),
      order({ customerId: 'ana', total: 5000 }),
      order({ customerId: 'bia', total: 20000 }),
    ]
    const result = customersOf(
      sales,
      { from: '2026-10-01', to: '2026-10-20' },
      new Map([
        ['ana', '2026-10-05'],
        ['bia', '2025-12-24'],
      ]),
      new Map([
        ['ana', 'Ana'],
        ['bia', 'Bia'],
      ]),
      7,
    )
    expect(result).toEqual({
      buyers: 2,
      newBuyers: 1,
      returningBuyers: 1,
      signups: 7,
      top: [
        { customerId: 'bia', name: 'Bia', orders: 1, revenue: 20000, isNew: false },
        { customerId: 'ana', name: 'Ana', orders: 2, revenue: 10000, isNew: true },
      ],
    })
  })

  it('produtos agrupam pelo produto (não pelo nome copiado) e trazem os vistos sem venda', () => {
    const item = (productId: string | null, productName: string, quantity: number, totalPrice: number) => ({
      productId,
      productName,
      quantity,
      totalPrice,
      imageUrl: null,
    })
    const sales = [
      order({ items: [item('p1', 'Vela Lavanda', 2, 9000)] }),
      // O mesmo produto depois de renomeado: continua uma linha só.
      order({ items: [item('p1', 'Vela de Lavanda', 1, 4500), item(null, 'Kit antigo', 1, 3000)] }),
    ]
    const catalog = new Map([
      ['p1', { name: 'Vela de Lavanda', slug: 'vela-de-lavanda', imageUrl: 'https://cdn/p1.jpg' }],
      ['p2', { name: 'Difusor', slug: 'difusor', imageUrl: null }],
    ])
    const views = new Map([
      ['p1', 40],
      ['p2', 25],
    ])
    expect(productsOf(sales, catalog, views)).toEqual([
      {
        productId: 'p1',
        name: 'Vela de Lavanda',
        slug: 'vela-de-lavanda',
        imageUrl: 'https://cdn/p1.jpg',
        unitsSold: 3,
        revenue: 13500,
        views: 40,
        orders: 2,
        conversionRate: 0.05,
      },
      {
        productId: null,
        name: 'Kit antigo',
        slug: null,
        imageUrl: null,
        unitsSold: 1,
        revenue: 3000,
        views: 0,
        orders: 1,
        conversionRate: null,
      },
      {
        productId: 'p2',
        name: 'Difusor',
        slug: 'difusor',
        imageUrl: null,
        unitsSold: 0,
        revenue: 0,
        views: 25,
        orders: 0,
        conversionRate: 0,
      },
    ])
  })

  it('produto em duas categorias soma nas duas', () => {
    const sales = [
      order({ items: [{ productId: 'p1', productName: 'Vela', quantity: 2, totalPrice: 9000, imageUrl: null }] }),
    ]
    const categories = new Map([
      [
        'p1',
        [
          { id: 'k1', name: 'Velas' },
          { id: 'k2', name: 'Presentes' },
        ],
      ],
    ])
    expect(categoriesOf(sales, categories)).toEqual([
      { categoryId: 'k1', name: 'Velas', unitsSold: 2, revenue: 9000, orders: 1 },
      { categoryId: 'k2', name: 'Presentes', unitsSold: 2, revenue: 9000, orders: 1 },
    ])
  })
})
