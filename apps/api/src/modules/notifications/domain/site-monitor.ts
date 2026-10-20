/**
 * Quando a sonda da loja vira alerta. Uma falha sozinha não avisa: o `next build`
 * do deploy sobrescreve o `.next` de um app no ar, e uma ou duas sondas falham
 * sem a loja ter caído de verdade. Com a sonda a cada 2 minutos, três falhas
 * seguidas são uns 6 minutos fora — a queda de agosto/2026 durou 9 dias.
 */

export const FAILURES_TO_ALERT = 3

export type ProbeState = {
  failures: number
  /** Epoch (ms) da primeira falha da sequência atual. */
  downSince: number | null
  /** Já avisou desta queda: não repete, e a volta merece aviso. */
  alerted: boolean
}

export const INITIAL_PROBE_STATE: ProbeState = { failures: 0, downSince: null, alerted: false }

export type ProbeStep = {
  state: ProbeState
  event: 'down' | 'up' | null
  /** Só na volta: quantos minutos ficou fora, contando da primeira falha. */
  downMinutes: number | null
}

export const advanceProbe = (prev: ProbeState, up: boolean, now: number): ProbeStep => {
  if (up) {
    const downMinutes =
      prev.alerted && prev.downSince !== null ? Math.max(1, Math.round((now - prev.downSince) / 60_000)) : null
    return { state: INITIAL_PROBE_STATE, event: prev.alerted ? 'up' : null, downMinutes }
  }

  const failures = prev.failures + 1
  const downSince = prev.downSince ?? now
  if (!prev.alerted && failures >= FAILURES_TO_ALERT) {
    return { state: { failures, downSince, alerted: true }, event: 'down', downMinutes: null }
  }
  return { state: { failures, downSince, alerted: prev.alerted }, event: null, downMinutes: null }
}
