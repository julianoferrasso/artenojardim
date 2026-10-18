import { describe, it, expect } from 'vitest'
import { createCouponSchema, updateCouponSchema } from '@ecommerce/shared/contracts'

const base = {
  code: 'bemvindo10',
  type: 'PERCENTAGE' as const,
  value: 10,
  minOrderValue: null,
  usageLimit: null,
  usageLimitPerCustomer: 1,
  startsAt: null,
  endsAt: null,
  isActive: true,
}

describe('createCouponSchema', () => {
  it('normaliza o código para maiúsculo e sem espaços nas pontas', () => {
    expect(createCouponSchema.parse({ ...base, code: '  bem-vindo_10 ' }).code).toBe('BEM-VINDO_10')
  })

  it('recusa código com espaço, acento ou curto demais', () => {
    expect(createCouponSchema.safeParse({ ...base, code: 'BEM VINDO' }).success).toBe(false)
    expect(createCouponSchema.safeParse({ ...base, code: 'PROMOÇÃO' }).success).toBe(false)
    expect(createCouponSchema.safeParse({ ...base, code: 'AB' }).success).toBe(false)
  })

  it('porcentagem vai de 1 a 100', () => {
    expect(createCouponSchema.safeParse({ ...base, value: 100 }).success).toBe(true)
    expect(createCouponSchema.safeParse({ ...base, value: 101 }).success).toBe(false)
    expect(createCouponSchema.safeParse({ ...base, value: 0 }).success).toBe(false)
  })

  it('valor fixo exige ao menos 1 centavo; frete grátis ignora o valor', () => {
    const fixed = { ...base, type: 'FIXED_AMOUNT' as const }
    expect(createCouponSchema.safeParse({ ...fixed, value: 0 }).success).toBe(false)
    expect(createCouponSchema.safeParse({ ...fixed, value: 2000 }).success).toBe(true)
    expect(
      createCouponSchema.safeParse({ ...base, type: 'FREE_SHIPPING', value: 0 }).success,
    ).toBe(true)
  })

  it('fim antes do início é recusado; mesmo dia vale', () => {
    const range = (startsAt: string, endsAt: string) =>
      createCouponSchema.safeParse({ ...base, startsAt, endsAt }).success
    expect(range('2026-11-20', '2026-11-19')).toBe(false)
    expect(range('2026-11-20', '2026-11-20')).toBe(true)
  })
})

describe('updateCouponSchema', () => {
  it('não troca o código (o campo é descartado)', () => {
    const { code: _code, ...rest } = base
    expect(updateCouponSchema.parse({ ...rest, code: 'OUTRO' })).not.toHaveProperty('code')
  })
})
