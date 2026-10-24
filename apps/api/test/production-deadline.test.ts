import { describe, it, expect } from 'vitest'
import {
  isProductionDigestTime,
  productionDeadlineState,
} from '../src/modules/admin-orders/domain/production.js'

/**
 * O prazo de produção é promessa feita ao cliente no checkout. Errar "atrasada"
 * para cima vira alarme falso diário; para baixo, encomenda esquecida.
 * Datas em UTC, decididas no dia brasileiro (UTC−3).
 */

describe('productionDeadlineState', () => {
  // Quarta 21/10/2026, 10h em Brasília.
  const now = new Date('2026-10-21T13:00:00Z')

  it('dia do prazo já passou → atrasada', () => {
    expect(productionDeadlineState({ dueAt: new Date('2026-10-20T15:00:00Z'), now })).toBe('OVERDUE')
  })

  it('vence hoje ou no próximo dia útil → vence logo', () => {
    expect(productionDeadlineState({ dueAt: new Date('2026-10-21T20:00:00Z'), now })).toBe('DUE_SOON')
    expect(productionDeadlineState({ dueAt: new Date('2026-10-22T15:00:00Z'), now })).toBe('DUE_SOON')
  })

  it('mais longe que isso → no prazo', () => {
    expect(productionDeadlineState({ dueAt: new Date('2026-10-23T15:00:00Z'), now })).toBe('OK')
  })

  it('na sexta, o prazo de segunda já vence logo (o fim de semana não conta)', () => {
    const friday = new Date('2026-10-23T13:00:00Z')
    expect(productionDeadlineState({ dueAt: new Date('2026-10-26T15:00:00Z'), now: friday })).toBe('DUE_SOON')
  })

  it('o dia é o brasileiro: 22h de ontem em Brasília ainda é ontem', () => {
    // 21/10 01:00 UTC = 20/10 22:00 em Brasília → venceu ontem.
    expect(productionDeadlineState({ dueAt: new Date('2026-10-21T01:00:00Z'), now })).toBe('OVERDUE')
  })
})

describe('isProductionDigestTime', () => {
  it('dia útil a partir das 8h de Brasília', () => {
    expect(isProductionDigestTime(new Date('2026-10-21T11:00:00Z'))).toBe(true) // qua 08h
    expect(isProductionDigestTime(new Date('2026-10-21T10:59:00Z'))).toBe(false) // qua 07h59
    expect(isProductionDigestTime(new Date('2026-10-21T23:00:00Z'))).toBe(true) // qua 20h
  })

  it('fim de semana não tem resumo', () => {
    expect(isProductionDigestTime(new Date('2026-10-24T13:00:00Z'))).toBe(false) // sáb
    expect(isProductionDigestTime(new Date('2026-10-25T13:00:00Z'))).toBe(false) // dom
  })
})
