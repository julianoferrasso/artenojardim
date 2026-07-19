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
})
