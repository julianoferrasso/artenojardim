import { describe, it, expect } from 'vitest'
import { lowStockCrossing } from '../src/modules/notifications/domain/low-stock.js'
import {
  FAILURES_TO_ALERT,
  INITIAL_PROBE_STATE,
  advanceProbe,
  type ProbeState,
} from '../src/modules/notifications/domain/site-monitor.js'

/**
 * Quando estoque e sonda viram alerta. Os dois só avisam na MUDANÇA: estoque ao
 * cruzar o limite (e de novo ao zerar), a sonda na terceira falha seguida e na
 * volta. Repetir a cada venda ou a cada sonda é o caminho para o alerta virar
 * ruído que ninguém lê.
 */

describe('lowStockCrossing', () => {
  const threshold = 2

  it('avisa ao cruzar o limite', () => {
    expect(lowStockCrossing({ before: 3, after: 2, threshold })).toBe('low')
    expect(lowStockCrossing({ before: 5, after: 1, threshold })).toBe('low')
  })

  it('não repete abaixo do limite, mas avisa de novo ao esgotar', () => {
    expect(lowStockCrossing({ before: 2, after: 1, threshold })).toBeNull()
    expect(lowStockCrossing({ before: 1, after: 0, threshold })).toBe('out')
  })

  it('esgotar de uma vez (de 5 para 0) é um aviso só: esgotado', () => {
    expect(lowStockCrossing({ before: 5, after: 0, threshold })).toBe('out')
  })

  it('acima do limite, ou subindo, não avisa', () => {
    expect(lowStockCrossing({ before: 10, after: 3, threshold })).toBeNull()
    expect(lowStockCrossing({ before: 0, after: 4, threshold })).toBeNull()
    expect(lowStockCrossing({ before: 2, after: 2, threshold })).toBeNull()
  })

  it('limite 0 = só avisa ao esgotar', () => {
    expect(lowStockCrossing({ before: 2, after: 1, threshold: 0 })).toBeNull()
    expect(lowStockCrossing({ before: 1, after: 0, threshold: 0 })).toBe('out')
  })
})

describe('advanceProbe', () => {
  const MIN = 60_000
  const fail = (state: ProbeState, at: number) => advanceProbe(state, false, at)

  it(`só avisa na falha nº ${FAILURES_TO_ALERT} seguida — o deploy derruba uma ou duas sondas`, () => {
    let state = INITIAL_PROBE_STATE
    const events: (string | null)[] = []
    for (let i = 0; i < FAILURES_TO_ALERT + 2; i++) {
      const step = fail(state, i * 2 * MIN)
      events.push(step.event)
      state = step.state
    }
    expect(events).toEqual([null, null, 'down', null, null])
  })

  it('uma sonda boa no meio zera a contagem', () => {
    let state = fail(INITIAL_PROBE_STATE, 0).state
    state = fail(state, 2 * MIN).state
    state = advanceProbe(state, true, 4 * MIN).state
    expect(fail(state, 6 * MIN).event).toBeNull()
  })

  it('a volta avisa, com os minutos contados da primeira falha', () => {
    let state = INITIAL_PROBE_STATE
    for (let i = 0; i < FAILURES_TO_ALERT; i++) state = fail(state, i * 2 * MIN).state
    const back = advanceProbe(state, true, 10 * MIN)
    expect(back.event).toBe('up')
    expect(back.downMinutes).toBe(10)
    expect(back.state).toEqual(INITIAL_PROBE_STATE)
  })

  it('a volta de uma falha que nem chegou a avisar não avisa nada', () => {
    const state = fail(INITIAL_PROBE_STATE, 0).state
    expect(advanceProbe(state, true, 2 * MIN).event).toBeNull()
  })
})
