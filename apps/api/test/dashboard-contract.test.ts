import { describe, it, expect } from 'vitest'
import { dashboardQuerySchema } from '@ecommerce/shared/contracts'

/**
 * A query do dashboard chega pela URL, montada pelo admin — mas qualquer um com
 * sessão de staff pode montá-la à mão. O contrato é a cerca.
 */

const parse = (query: Record<string, string>) => dashboardQuerySchema.safeParse(query)

describe('dashboardQuerySchema', () => {
  it('aceita só o período, sem comparação e sem agrupamento', () => {
    const result = parse({ from: '2026-10-01', to: '2026-10-20' })
    expect(result.success).toBe(true)
  })

  it('aceita período, comparação e agrupamento coerentes', () => {
    const result = parse({
      from: '2026-09-21',
      to: '2026-10-20',
      compareFrom: '2026-08-22',
      compareTo: '2026-09-20',
      granularity: 'week',
    })
    expect(result.success).toBe(true)
  })

  it('recusa início depois do fim', () => {
    expect(parse({ from: '2026-10-20', to: '2026-10-01' }).success).toBe(false)
  })

  it('recusa comparação pela metade', () => {
    expect(parse({ from: '2026-10-01', to: '2026-10-20', compareFrom: '2026-09-01' }).success).toBe(false)
  })

  it('recusa período maior que dois anos', () => {
    expect(parse({ from: '2024-10-19', to: '2026-10-20' }).success).toBe(false)
    expect(parse({ from: '2024-10-20', to: '2026-10-20' }).success).toBe(true)
  })

  it('recusa agrupamento que não cabe na duração', () => {
    expect(parse({ from: '2026-10-19', to: '2026-10-20', granularity: 'hour' }).success).toBe(false)
    expect(parse({ from: '2026-10-14', to: '2026-10-20', granularity: 'month' }).success).toBe(false)
  })

  it('recusa data que não existe', () => {
    expect(parse({ from: '2026-02-30', to: '2026-03-01' }).success).toBe(false)
  })
})
