import { describe, it, expect } from 'vitest'
import { cartItemIssue } from '../src/modules/cart/domain/item-issue.js'

/**
 * O motivo decide a frase e a saída no carrinho: remover (indisponível,
 * esgotado) ou ajustar ao que resta (parcial).
 */

describe('cartItemIssue', () => {
  it('comprável → null', () => {
    expect(cartItemIssue({ active: true, available: 5, quantity: 2 })).toBeNull()
    expect(cartItemIssue({ active: true, available: 2, quantity: 2 })).toBeNull()
  })

  it('fora do ar vence o estoque: repor não traria o item de volta', () => {
    expect(cartItemIssue({ active: false, available: 10, quantity: 1 })).toBe('UNAVAILABLE')
    expect(cartItemIssue({ active: false, available: 0, quantity: 1 })).toBe('UNAVAILABLE')
  })

  it('sem nenhuma unidade → OUT_OF_STOCK', () => {
    expect(cartItemIssue({ active: true, available: 0, quantity: 1 })).toBe('OUT_OF_STOCK')
  })

  it('menos do que o pedido → PARTIAL (dá para ajustar)', () => {
    expect(cartItemIssue({ active: true, available: 1, quantity: 3 })).toBe('PARTIAL')
  })
})
