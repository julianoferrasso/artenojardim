import { describe, it, expect } from 'vitest'
import {
  balanceFrom,
  balanceAt,
  withRunningBalance,
  countDelta,
} from '../src/modules/inventory/domain/ledger.js'

const mov = (quantity: number, iso: string) => ({ quantity, createdAt: new Date(iso) })

describe('balanceFrom', () => {
  it('soma as quantidades com sinal', () => {
    expect(balanceFrom([{ quantity: 10 }, { quantity: -3 }, { quantity: 5 }])).toBe(12)
  })
  it('ledger vazio = 0', () => {
    expect(balanceFrom([])).toBe(0)
  })
  it('movimentos que se anulam voltam a 0', () => {
    expect(balanceFrom([{ quantity: 5 }, { quantity: -5 }])).toBe(0)
  })
})

describe('balanceAt (estoque retroativo)', () => {
  const movements = [
    mov(10, '2026-01-01'),
    mov(-2, '2026-06-15'),
    mov(5, '2026-12-20'),
  ]
  it('conta só o que veio até a data', () => {
    expect(balanceAt(movements, new Date('2026-06-30'))).toBe(8)
  })
  it('antes de tudo = 0', () => {
    expect(balanceAt(movements, new Date('2025-12-31'))).toBe(0)
  })
  it('depois de tudo = saldo total', () => {
    expect(balanceAt(movements, new Date('2027-01-01'))).toBe(13)
  })
})

describe('withRunningBalance', () => {
  it('acumula e devolve do mais recente ao mais antigo', () => {
    const result = withRunningBalance([
      mov(10, '2026-01-01'), // saldo 10
      mov(-3, '2026-02-01'), // saldo 7
      mov(5, '2026-03-01'), // saldo 12
    ])
    // Ordem invertida (mais recente primeiro), cada linha com o saldo após ela.
    expect(result.map((m) => m.runningBalance)).toEqual([12, 7, 10])
    expect(result[0]!.quantity).toBe(5)
  })

  it('extrato vazio', () => {
    expect(withRunningBalance([])).toEqual([])
  })
})

describe('countDelta (inventário físico)', () => {
  it('contou menos que o sistema → diferença negativa', () => {
    expect(countDelta(10, 8)).toBe(-2)
  })
  it('contou mais → diferença positiva', () => {
    expect(countDelta(10, 12)).toBe(2)
  })
  it('bateu → zero (nada a lançar)', () => {
    expect(countDelta(10, 10)).toBe(0)
  })
})
