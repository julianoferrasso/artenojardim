import { describe, it, expect } from 'vitest'
import { toPackages, type PackItem } from '../src/modules/shipping/domain/packing.js'
import { isAppError } from '../src/shared/errors.js'

const item = (over: Partial<PackItem> = {}): PackItem => ({
  variantId: 'v1',
  quantity: 1,
  weightGrams: 500,
  lengthMm: 200,
  widthMm: 150,
  heightMm: 100,
  priceCents: 4990,
  ...over,
})

describe('toPackages', () => {
  it('converte gramas→kg, mm→cm, centavos→reais', () => {
    const [p] = toPackages([item()])
    expect(p).toEqual({
      id: 'v1',
      weightKg: 0.5,
      lengthCm: 20,
      widthCm: 15,
      heightCm: 10,
      valueReais: 49.9,
      quantity: 1,
    })
  })

  it('preserva a quantidade e um pacote por variante', () => {
    const out = toPackages([item({ variantId: 'a', quantity: 3 }), item({ variantId: 'b', quantity: 2 })])
    expect(out.map((p) => [p.id, p.quantity])).toEqual([
      ['a', 3],
      ['b', 2],
    ])
  })

  it('arredonda peso a 3 casas e dimensões a 1 casa', () => {
    const [p] = toPackages([item({ weightGrams: 333, lengthMm: 111, widthMm: 155, heightMm: 107 })])
    expect(p.weightKg).toBe(0.333)
    expect(p.lengthCm).toBe(11.1)
    expect(p.widthCm).toBe(15.5)
    expect(p.heightCm).toBe(10.7)
  })

  it('bloqueia item sem peso', () => {
    try {
      toPackages([item({ weightGrams: 0 })])
      expect.unreachable('deveria ter lançado')
    } catch (err) {
      expect(isAppError(err)).toBe(true)
      expect((err as { code: string }).code).toBe('SHIPPING_UNAVAILABLE')
    }
  })

  it('bloqueia item sem dimensão', () => {
    for (const dim of ['lengthMm', 'widthMm', 'heightMm'] as const) {
      expect(() => toPackages([item({ [dim]: 0 })])).toThrow()
    }
  })

  it('lista vazia → erro de carrinho vazio', () => {
    try {
      toPackages([])
      expect.unreachable('deveria ter lançado')
    } catch (err) {
      expect((err as { code: string }).code).toBe('CART_EMPTY')
    }
  })
})
