import { describe, it, expect } from 'vitest'
import { cartItemIssue } from '../src/modules/cart/domain/item-issue.js'

/**
 * O motivo decide a frase e a saída no carrinho: remover (indisponível,
 * esgotado) ou ajustar ao que resta (parcial).
 */

const stockOnly = { active: true, policy: 'STOCK_ONLY' } as const

describe('cartItemIssue', () => {
  it('comprável → null', () => {
    expect(cartItemIssue({ ...stockOnly, available: 5, quantity: 2 })).toBeNull()
    expect(cartItemIssue({ ...stockOnly, available: 2, quantity: 2 })).toBeNull()
  })

  it('fora do ar vence o estoque: repor não traria o item de volta', () => {
    expect(cartItemIssue({ ...stockOnly, active: false, available: 10, quantity: 1 })).toBe('UNAVAILABLE')
    expect(cartItemIssue({ ...stockOnly, active: false, available: 0, quantity: 1 })).toBe('UNAVAILABLE')
  })

  it('sem nenhuma unidade → OUT_OF_STOCK', () => {
    expect(cartItemIssue({ ...stockOnly, available: 0, quantity: 1 })).toBe('OUT_OF_STOCK')
  })

  it('menos do que o pedido → PARTIAL (dá para ajustar)', () => {
    expect(cartItemIssue({ ...stockOnly, available: 1, quantity: 3 })).toBe('PARTIAL')
  })

  it('sob encomenda e híbrido nunca esgotam: o que falta é produzido', () => {
    for (const policy of ['MADE_TO_ORDER', 'STOCK_THEN_MADE_TO_ORDER'] as const) {
      expect(cartItemIssue({ active: true, policy, available: 0, quantity: 3 })).toBeNull()
      expect(cartItemIssue({ active: true, policy, available: 1, quantity: 3 })).toBeNull()
    }
  })

  it('fora do ar continua indisponível em qualquer política', () => {
    expect(cartItemIssue({ active: false, policy: 'MADE_TO_ORDER', available: 0, quantity: 1 })).toBe('UNAVAILABLE')
  })
})
