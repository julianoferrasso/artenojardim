import { describe, it, expect } from 'vitest'
import {
  aggregateAvailable,
  availableOf,
  lowStockRemainingOf,
  stockStatusOf,
  visibleStockChanged,
} from '../src/modules/inventory/domain/availability.js'

/**
 * O que a vitrine mostra do estoque. O erro caro aqui é mentir: dizer "à venda"
 * do que esgotou, ou "esgotado" do que tem — e derrubar o cache da loja inteira
 * por uma mudança que ninguém vê.
 */

describe('availableOf', () => {
  it('é o físico menos o reservado', () => {
    expect(availableOf({ onHand: 5, reserved: 2 })).toBe(3)
  })
  it('nunca negativo (físico abaixo do reservado, de antes da trava)', () => {
    expect(availableOf({ onHand: 1, reserved: 3 })).toBe(0)
  })
  it('variação sem linha de nível = 0', () => {
    expect(availableOf(null)).toBe(0)
    expect(availableOf(undefined)).toBe(0)
  })
})

describe('stockStatusOf / lowStockRemainingOf', () => {
  it('0 → esgotado, sem contagem', () => {
    expect(stockStatusOf(0)).toBe('OUT_OF_STOCK')
    expect(lowStockRemainingOf(0)).toBeNull()
  })
  it('1 e 2 → últimas unidades, com a contagem', () => {
    expect(stockStatusOf(1)).toBe('LOW_STOCK')
    expect(lowStockRemainingOf(1)).toBe(1)
    expect(stockStatusOf(2)).toBe('LOW_STOCK')
    expect(lowStockRemainingOf(2)).toBe(2)
  })
  it('3 ou mais → em estoque, sem número exposto', () => {
    expect(stockStatusOf(3)).toBe('IN_STOCK')
    expect(lowStockRemainingOf(3)).toBeNull()
    expect(lowStockRemainingOf(40)).toBeNull()
  })
})

describe('aggregateAvailable', () => {
  it('soma as variações; esgotado só quando nenhuma tem', () => {
    expect(aggregateAvailable([{ onHand: 0, reserved: 0 }, { onHand: 2, reserved: 1 }, null])).toBe(1)
    expect(aggregateAvailable([{ onHand: 1, reserved: 1 }, null])).toBe(0)
    expect(aggregateAvailable([])).toBe(0)
  })
})

describe('visibleStockChanged (revalidar a vitrine?)', () => {
  it.each([
    [3, 2],
    [2, 1],
    [1, 0],
    [0, 3],
    [0, 1],
    [5, 0],
  ])('%i → %i muda o que a vitrine mostra', (before, after) => {
    expect(visibleStockChanged(before, after)).toBe(true)
  })

  it.each([
    [5, 4],
    [10, 3],
    [3, 7],
    [0, -1],
  ])('%i → %i não muda nada visível', (before, after) => {
    expect(visibleStockChanged(before, after)).toBe(false)
  })
})
