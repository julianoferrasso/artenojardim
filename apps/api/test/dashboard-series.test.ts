import { describe, it, expect } from 'vitest'
import { buildFrame, comparisonCutoff, projectToCurrent } from '../src/modules/dashboard/domain/series.js'
import { buildOverview, type OverviewInput } from '../src/modules/dashboard/domain/overview.js'
import type { OrderRow } from '../src/modules/dashboard/domain/sales.js'

/**
 * A moldura do gráfico e a comparação. Os erros que este arquivo prende são os
 * que mentem em silêncio: semana parcial comparada com semana cheia, "hoje às
 * 10h" comparado com "ontem inteiro", hora futura desenhada como zero.
 */

describe('buildFrame', () => {
  it('semana começa no domingo, mas o 1º balde começa no início do período', () => {
    const frame = buildFrame({ from: '2026-10-01', to: '2026-10-20' }, null, 'week')
    expect(frame.keys).toEqual(['2026-10-01', '2026-10-04', '2026-10-11', '2026-10-18'])
    expect(frame.lastDays).toEqual(['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-20'])
    expect(frame.indexOf('2026-10-03')).toBe(0)
    expect(frame.indexOf('2026-10-04')).toBe(1)
    expect(frame.indexOf('2026-10-21')).toBeNull()
  })

  it('mês: o 1º balde parcial e os seguintes no dia 1', () => {
    const frame = buildFrame({ from: '2026-01-15', to: '2026-03-10' }, null, 'month')
    expect(frame.keys).toEqual(['2026-01-15', '2026-02-01', '2026-03-01'])
  })

  it('hora: 24 baldes do dia, com o equivalente no comparado', () => {
    const frame = buildFrame(
      { from: '2026-10-20', to: '2026-10-20' },
      { from: '2026-10-19', to: '2026-10-19' },
      'hour',
    )
    expect(frame.keys).toHaveLength(24)
    expect(frame.keys[14]).toBe('2026-10-20T14')
    expect(frame.previousKeys[14]).toBe('2026-10-19T14')
    expect(frame.indexOf('2026-10-20T14')).toBe(14)
    expect(frame.indexOf('2026-10-19T14')).toBeNull()
  })

  it('comparado mais curto deixa os últimos baldes sem equivalente', () => {
    const frame = buildFrame({ from: '2026-03-01', to: '2026-03-31' }, { from: '2026-02-01', to: '2026-02-28' }, 'day')
    expect(frame.previousKeys[27]).toBe('2026-02-28')
    expect(frame.previousKeys[28]).toBeNull()
    expect(frame.previousKeys[30]).toBeNull()
  })
})

describe('projectToCurrent', () => {
  const period = { from: '2026-10-01', to: '2026-10-10' }
  const comparison = { from: '2026-09-21', to: '2026-09-30' }

  it('leva o dia do comparado para o dia equivalente do atual', () => {
    expect(projectToCurrent('2026-09-24', period, comparison)).toBe('2026-10-04')
    expect(projectToCurrent('2026-09-24T09', period, comparison)).toBe('2026-10-04T09')
  })

  it('o excedente do comparado mais longo fica fora do gráfico', () => {
    expect(projectToCurrent('2026-09-24', { from: '2026-10-01', to: '2026-10-02' }, comparison)).toBeNull()
  })
})

describe('comparisonCutoff', () => {
  it('quando o período termina hoje, corta o comparado na mesma hora de agora', () => {
    const now = new Date('2026-10-20T17:30:00.000Z') // 14:30 em Brasília
    const cutoff = comparisonCutoff(
      { from: '2026-10-20', to: '2026-10-20' },
      { from: '2026-10-19', to: '2026-10-19' },
      '2026-10-20',
      now,
    )
    expect(cutoff?.toISOString()).toBe('2026-10-19T17:30:00.000Z')
  })

  it('período que já terminou compara inteiro', () => {
    expect(
      comparisonCutoff(
        { from: '2026-10-01', to: '2026-10-19' },
        { from: '2026-09-12', to: '2026-09-30' },
        '2026-10-20',
        new Date('2026-10-20T17:30:00.000Z'),
      ),
    ).toBeNull()
  })
})

let seq = 0
const sale = (createdAt: string, over: Partial<OrderRow> = {}): OrderRow => ({
  id: `o${++seq}`,
  createdAt: new Date(createdAt),
  customerId: 'c1',
  paymentStatus: 'PAID',
  canceledAt: null,
  subtotal: 10000,
  discountTotal: 0,
  shippingTotal: 0,
  total: 10000,
  couponCodeSnapshot: null,
  state: 'SP',
  payments: [{ method: 'PIX', status: 'PAID', refundedAmount: 0, paidAt: new Date(createdAt) }],
  items: [],
  ...over,
})

const input = (over: Partial<OverviewInput>): OverviewInput => ({
  now: new Date('2026-10-20T17:30:00.000Z'), // 14:30 em Brasília
  today: '2026-10-20',
  period: { from: '2026-10-20', to: '2026-10-20' },
  comparison: { from: '2026-10-19', to: '2026-10-19' },
  granularity: 'hour',
  orders: [],
  comparisonOrders: [],
  visits: [],
  comparisonVisits: [],
  trafficSince: null,
  traffic: [],
  signups: 0,
  firstSaleDay: new Map(),
  customerNames: new Map(),
  catalog: new Map(),
  categoriesByProduct: new Map(),
  viewsByProduct: new Map(),
  ...over,
})

describe('buildOverview — hoje contra ontem', () => {
  const overview = buildOverview(
    input({
      orders: [sale('2026-10-20T13:00:00.000Z')], // 10h
      comparisonOrders: [
        sale('2026-10-19T13:00:00.000Z'), // 10h de ontem: antes do corte
        sale('2026-10-19T18:00:00.000Z'), // 15h de ontem: depois do corte
      ],
    }),
  )

  it('o total do comparado para na mesma hora de agora', () => {
    expect(overview.summary.current.orders).toBe(1)
    expect(overview.summary.previous?.orders).toBe(1)
    expect(overview.comparison?.cutoffAt).toBe('2026-10-19T17:30:00.000Z')
  })

  it('a linha de hoje para em "agora"; a de ontem segue inteira como referência', () => {
    expect(overview.series[14]?.current).not.toBeNull()
    expect(overview.series[15]?.current).toBeNull()
    expect(overview.series[23]?.current).toBeNull()
    expect(overview.series[15]?.previous?.orders).toBe(1)
    expect(overview.series[10]?.current?.orders).toBe(1)
  })
})

describe('buildOverview — visitas e conversão', () => {
  it('sem contagem de visitas, visitas e conversão são null, não zero', () => {
    const overview = buildOverview(input({ orders: [sale('2026-10-20T13:00:00.000Z')] }))
    expect(overview.summary.current.visits).toBeNull()
    expect(overview.summary.current.conversionRate).toBeNull()
    expect(overview.funnel.visits).toBeNull()
  })

  it('a conversão só usa vendas de dias com visita contada', () => {
    const overview = buildOverview(
      input({
        period: { from: '2026-10-14', to: '2026-10-20' },
        comparison: null,
        granularity: 'day',
        trafficSince: '2026-10-19',
        orders: [
          sale('2026-10-15T13:00:00.000Z'), // antes da contagem
          sale('2026-10-19T13:00:00.000Z'),
          sale('2026-10-20T13:00:00.000Z'),
        ],
        visits: [
          { date: '2026-10-19', hour: 10, count: 60 },
          { date: '2026-10-20', hour: 10, count: 40 },
        ],
      }),
    )
    expect(overview.summary.current.orders).toBe(3)
    expect(overview.summary.current.visits).toBe(100)
    expect(overview.summary.current.conversionRate).toBeCloseTo(0.02)
    // Dia anterior à contagem: visitas desconhecidas.
    expect(overview.series[1]?.current?.visits).toBeNull()
    expect(overview.series[5]?.current?.visits).toBe(60)
  })

  it('ticket médio arredonda para o centavo', () => {
    const overview = buildOverview(
      input({
        orders: [sale('2026-10-20T13:00:00.000Z', { total: 5000 }), sale('2026-10-20T14:00:00.000Z', { total: 5001 })],
      }),
    )
    expect(overview.summary.current.averageTicket).toBe(5001)
  })

  it('o funil soma exatamente os pedidos criados', () => {
    const overview = buildOverview(
      input({
        orders: [
          sale('2026-10-20T13:00:00.000Z'),
          sale('2026-10-20T13:10:00.000Z', { paymentStatus: 'PENDING', payments: [] }),
          sale('2026-10-20T13:20:00.000Z', { canceledAt: new Date('2026-10-20T14:00:00.000Z') }),
        ],
      }),
    )
    const { created, paid, awaitingPayment, canceled } = overview.funnel
    expect({ created, paid, awaitingPayment, canceled }).toEqual({
      created: 3,
      paid: 1,
      awaitingPayment: 1,
      canceled: 1,
    })
    expect(paid + awaitingPayment + canceled).toBe(created)
  })
})

describe('buildOverview — comparação projetada', () => {
  it('o comparado cai no dia equivalente, não no índice do balde', () => {
    const overview = buildOverview(
      input({
        today: '2026-10-25',
        now: new Date('2026-10-25T15:00:00.000Z'),
        period: { from: '2026-10-01', to: '2026-10-20' },
        comparison: { from: '2026-09-01', to: '2026-09-20' },
        granularity: 'week',
        comparisonOrders: [sale('2026-09-05T15:00:00.000Z')], // 5º dia do comparado
      }),
    )
    // 01/10 + 4 dias = 05/10, que está no 2º balde semanal (04 a 10/10).
    expect(overview.series[1]?.previous?.orders).toBe(1)
    expect(overview.series[1]?.previousKey).toBe('2026-09-04')
    expect(overview.summary.previous?.orders).toBe(1)
  })
})
