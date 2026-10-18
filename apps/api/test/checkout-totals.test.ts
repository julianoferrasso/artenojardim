import { describe, it, expect } from 'vitest'
import { calculateTotals } from '../src/modules/checkout/domain/totals.js'

describe('calculateTotals', () => {
  it('soma itens (preço × quantidade) + frete', () => {
    const t = calculateTotals({
      items: [
        { unitPrice: 5000, quantity: 2 },
        { unitPrice: 3000, quantity: 1 },
      ],
      shippingCents: 2350,
    })
    expect(t).toEqual({ subtotal: 13000, discountTotal: 0, shippingTotal: 2350, total: 15350 })
  })

  it('sem itens → tudo zero (só frete, se houver)', () => {
    expect(calculateTotals({ items: [], shippingCents: 0 })).toEqual({
      subtotal: 0,
      discountTotal: 0,
      shippingTotal: 0,
      total: 0,
    })
  })

  it('desconto maior que o subtotal é limitado ao subtotal (total nunca negativo)', () => {
    const t = calculateTotals({
      items: [{ unitPrice: 1000, quantity: 1 }],
      shippingCents: 500,
      discountCents: 5000,
    })
    expect(t.discountTotal).toBe(1000)
    expect(t.total).toBe(500) // 1000 - 1000 + 500
  })

  it('desconto negativo é tratado como zero', () => {
    const t = calculateTotals({ items: [{ unitPrice: 1000, quantity: 1 }], shippingCents: 0, discountCents: -999 })
    expect(t.discountTotal).toBe(0)
    expect(t.total).toBe(1000)
  })

  it('frete negativo vira zero', () => {
    const t = calculateTotals({ items: [{ unitPrice: 1000, quantity: 1 }], shippingCents: -100 })
    expect(t.shippingTotal).toBe(0)
    expect(t.total).toBe(1000)
  })

  it('desconto no frete mantém o frete cheio e entra no desconto', () => {
    const t = calculateTotals({
      items: [{ unitPrice: 1000, quantity: 1 }],
      shippingCents: 2500,
      shippingDiscountCents: 2500,
    })
    expect(t).toEqual({ subtotal: 1000, discountTotal: 2500, shippingTotal: 2500, total: 1000 })
  })

  it('desconto no frete é limitado ao frete', () => {
    const t = calculateTotals({
      items: [{ unitPrice: 1000, quantity: 1 }],
      shippingCents: 800,
      shippingDiscountCents: 5000,
    })
    expect(t.discountTotal).toBe(800)
    expect(t.total).toBe(1000)
  })

  it('soma os dois descontos, cada um no seu teto', () => {
    const t = calculateTotals({
      items: [{ unitPrice: 1000, quantity: 1 }],
      shippingCents: 500,
      discountCents: 9999,
      shippingDiscountCents: 9999,
    })
    expect(t.discountTotal).toBe(1500)
    expect(t.total).toBe(0)
  })
})
