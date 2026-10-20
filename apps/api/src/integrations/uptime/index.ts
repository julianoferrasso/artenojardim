/**
 * Uma visita pelo endereço PÚBLICO, como a de um cliente: DNS, Nginx, TLS e o
 * app. Um app de pé atrás de um Nginx morto (os 9 dias de agosto/2026) só
 * aparece assim — o `localhost` respondia 200 o tempo todo.
 *
 * Nunca lança: quem chama quer "no ar ou não", e uma exceção seria só outra
 * forma de dizer "não".
 */

export type ProbeResult = { up: boolean; detail: string }

export const probeUrl = async (
  url: string,
  /** `ok`: exige 2xx (healthcheck). `responding`: qualquer coisa abaixo de 500 (a home pode redirecionar). */
  expect: 'ok' | 'responding',
): Promise<ProbeResult> => {
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'artenojardim-monitor' },
      signal: AbortSignal.timeout(15_000),
    })
    // O corpo não interessa; sem cancelar, a conexão fica presa até o GC.
    await res.body?.cancel().catch(() => {})
    const up = expect === 'ok' ? res.ok : res.status < 500
    return { up, detail: `HTTP ${res.status}` }
  } catch (err) {
    const timeout = err instanceof Error && err.name === 'TimeoutError'
    return { up: false, detail: timeout ? 'sem resposta em 15 s' : 'falha de conexão' }
  }
}
