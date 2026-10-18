import { describe, it, expect } from 'vitest'
import {
  checkCouponEligibility,
  computeCouponDiscount,
  type CouponRule,
} from '../src/modules/coupons/domain/rules.js'

const NOW = new Date('2026-11-20T15:00:00.000Z')

const coupon = (over: Partial<CouponRule> = {}): CouponRule => ({
  type: 'PERCENTAGE',
  value: 10,
  isActive: true,
  startsAt: null,
  endsAt: null,
  minOrderValue: null,
  usageLimit: null,
  usageCount: 0,
  usageLimitPerCustomer: null,
  ...over,
})

const ctx = { now: NOW, subtotal: 10000, customerUses: 0 }

describe('checkCouponEligibility', () => {
  it('cupom sem restrições vale', () => {
    expect(checkCouponEligibility(coupon(), ctx)).toBeNull()
  })

  it('inativo responde como inexistente', () => {
    expect(checkCouponEligibility(coupon({ isActive: false }), ctx)).toBe('COUPON_NOT_FOUND')
  })

  it('agendado responde como inexistente (não revela campanha futura)', () => {
    const startsAt = new Date(NOW.getTime() + 1)
    expect(checkCouponEligibility(coupon({ startsAt }), ctx)).toBe('COUPON_NOT_FOUND')
    expect(checkCouponEligibility(coupon({ startsAt: NOW }), ctx)).toBeNull()
  })

  it('vale até o último instante de endsAt, inclusive', () => {
    expect(checkCouponEligibility(coupon({ endsAt: NOW }), ctx)).toBeNull()
    const endsAt = new Date(NOW.getTime() - 1)
    expect(checkCouponEligibility(coupon({ endsAt }), ctx)).toBe('COUPON_EXPIRED')
  })

  it('esgota quando os usos chegam ao limite', () => {
    expect(checkCouponEligibility(coupon({ usageLimit: 5, usageCount: 4 }), ctx)).toBeNull()
    expect(checkCouponEligibility(coupon({ usageLimit: 5, usageCount: 5 }), ctx)).toBe(
      'COUPON_USAGE_LIMIT_REACHED',
    )
  })

  it('limite por cliente', () => {
    const c = coupon({ usageLimitPerCustomer: 1 })
    expect(checkCouponEligibility(c, ctx)).toBeNull()
    expect(checkCouponEligibility(c, { ...ctx, customerUses: 1 })).toBe('COUPON_ALREADY_USED')
  })

  it('pedido mínimo compara com o subtotal, inclusive', () => {
    expect(checkCouponEligibility(coupon({ minOrderValue: 10000 }), ctx)).toBeNull()
    expect(checkCouponEligibility(coupon({ minOrderValue: 10001 }), ctx)).toBe(
      'COUPON_MIN_ORDER_NOT_MET',
    )
  })
})

describe('computeCouponDiscount', () => {
  const amounts = { subtotal: 1995, shipping: 2500 }

  it('porcentagem arredonda para o centavo mais próximo e não toca no frete', () => {
    // 10% de R$ 19,95 = 199,5 centavos → 200
    expect(computeCouponDiscount({ type: 'PERCENTAGE', value: 10 }, amounts)).toEqual({
      products: 200,
      shipping: 0,
    })
  })

  it('100% zera os produtos', () => {
    expect(computeCouponDiscount({ type: 'PERCENTAGE', value: 100 }, amounts).products).toBe(1995)
  })

  it('valor fixo é limitado ao subtotal', () => {
    expect(computeCouponDiscount({ type: 'FIXED_AMOUNT', value: 1000 }, amounts).products).toBe(1000)
    expect(computeCouponDiscount({ type: 'FIXED_AMOUNT', value: 5000 }, amounts).products).toBe(1995)
  })

  it('frete grátis desconta o frete inteiro', () => {
    expect(computeCouponDiscount({ type: 'FREE_SHIPPING', value: 0 }, amounts)).toEqual({
      products: 0,
      shipping: 2500,
    })
  })

  it('frete grátis num frete já zerado não desconta nada', () => {
    const d = computeCouponDiscount(
      { type: 'FREE_SHIPPING', value: 0 },
      { subtotal: 1995, shipping: 0 },
    )
    expect(d.products + d.shipping).toBe(0)
  })
})
