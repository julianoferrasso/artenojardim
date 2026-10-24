import { describe, it, expect } from 'vitest'
import {
  aggregateAvailable,
  availableOf,
  lowStockRemainingOf,
  productStockStatusOf,
  productionDaysOf,
  splitLine,
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

describe('stockStatusOf com a política do produto', () => {
  it('sob encomenda é sempre MADE_TO_ORDER, tenha ou não estoque', () => {
    for (const available of [0, 1, 2, 50]) {
      expect(stockStatusOf(available, 'MADE_TO_ORDER')).toBe('MADE_TO_ORDER')
      expect(lowStockRemainingOf(available, 'MADE_TO_ORDER')).toBeNull()
    }
  })

  it('híbrido: com estoque é pronta entrega; sem, vira encomenda — nunca esgotado', () => {
    expect(stockStatusOf(5, 'STOCK_THEN_MADE_TO_ORDER')).toBe('IN_STOCK')
    expect(stockStatusOf(2, 'STOCK_THEN_MADE_TO_ORDER')).toBe('LOW_STOCK')
    expect(lowStockRemainingOf(2, 'STOCK_THEN_MADE_TO_ORDER')).toBe(2)
    expect(stockStatusOf(0, 'STOCK_THEN_MADE_TO_ORDER')).toBe('MADE_TO_ORDER')
    expect(lowStockRemainingOf(0, 'STOCK_THEN_MADE_TO_ORDER')).toBeNull()
  })

  it('sem política é pronta entrega (o comportamento de antes)', () => {
    expect(stockStatusOf(0)).toBe(stockStatusOf(0, 'STOCK_ONLY'))
    expect(stockStatusOf(0, 'STOCK_ONLY')).toBe('OUT_OF_STOCK')
  })
})

describe('productStockStatusOf', () => {
  it('sem variação à venda é esgotado em qualquer política', () => {
    expect(productStockStatusOf([], 'MADE_TO_ORDER')).toBe('OUT_OF_STOCK')
    expect(productStockStatusOf([], 'STOCK_THEN_MADE_TO_ORDER')).toBe('OUT_OF_STOCK')
  })

  it('soma as variações e aplica a política', () => {
    const levels = [{ onHand: 0, reserved: 0 }, null]
    expect(productStockStatusOf(levels, 'STOCK_ONLY')).toBe('OUT_OF_STOCK')
    expect(productStockStatusOf(levels, 'STOCK_THEN_MADE_TO_ORDER')).toBe('MADE_TO_ORDER')
    expect(productStockStatusOf([{ onHand: 9, reserved: 0 }], 'STOCK_THEN_MADE_TO_ORDER')).toBe('IN_STOCK')
  })
})

describe('splitLine (quanto sai da prateleira, quanto é produzido)', () => {
  it('pronta entrega: tudo ou nada', () => {
    expect(splitLine({ policy: 'STOCK_ONLY', available: 3, quantity: 2 })).toEqual({ ready: 2, madeToOrder: 0 })
    expect(splitLine({ policy: 'STOCK_ONLY', available: 1, quantity: 2 })).toBeNull()
  })

  it('sob encomenda: tudo produzido, mesmo com peça na prateleira', () => {
    expect(splitLine({ policy: 'MADE_TO_ORDER', available: 10, quantity: 2 })).toEqual({ ready: 0, madeToOrder: 2 })
  })

  it('híbrido DIVIDE: leva o que há e produz o resto', () => {
    expect(splitLine({ policy: 'STOCK_THEN_MADE_TO_ORDER', available: 2, quantity: 3 })).toEqual({
      ready: 2,
      madeToOrder: 1,
    })
    expect(splitLine({ policy: 'STOCK_THEN_MADE_TO_ORDER', available: 5, quantity: 3 })).toEqual({
      ready: 3,
      madeToOrder: 0,
    })
    expect(splitLine({ policy: 'STOCK_THEN_MADE_TO_ORDER', available: 0, quantity: 3 })).toEqual({
      ready: 0,
      madeToOrder: 3,
    })
  })

  it('disponível negativo conta como zero', () => {
    expect(splitLine({ policy: 'STOCK_THEN_MADE_TO_ORDER', available: -2, quantity: 1 })).toEqual({
      ready: 0,
      madeToOrder: 1,
    })
  })
})

describe('productionDaysOf (o pedido espera a peça mais lenta)', () => {
  it('o maior prazo entre as linhas com parte produzida', () => {
    expect(
      productionDaysOf([
        { madeToOrder: 1, productionDays: 5 },
        { madeToOrder: 2, productionDays: 9 },
        { madeToOrder: 0, productionDays: 30 },
      ]),
    ).toBe(9)
  })

  it('tudo pronta entrega = 0', () => {
    expect(productionDaysOf([{ madeToOrder: 0, productionDays: 7 }])).toBe(0)
    expect(productionDaysOf([])).toBe(0)
  })
})
