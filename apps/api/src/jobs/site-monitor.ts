import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { probeUrl } from '../integrations/uptime/index.js'
import { notifySiteStatus } from '../modules/notifications/service.js'
import {
  INITIAL_PROBE_STATE,
  advanceProbe,
  type ProbeState,
} from '../modules/notifications/domain/site-monitor.js'

/**
 * A loja, o painel e a API pelo endereço PÚBLICO, como um cliente chega. Em
 * agosto/2026 o Nginx morreu e os três apps seguiram respondendo no localhost:
 * nove dias fora sem ninguém saber. Esta sonda passa pelo Nginx e avisaria.
 *
 * O limite: roda NA PRÓPRIA VPS. Se a máquina inteira cair, o monitor cai junto e
 * não avisa — para isso só um monitor externo (docs/alertas.md).
 */

const TARGETS = [
  { name: 'Loja', url: env.STORE_URL, expect: 'responding' },
  { name: 'Painel', url: env.ADMIN_URL, expect: 'responding' },
  // O health exige 200: com o banco fora ele responde 503, e a loja não vende.
  { name: 'API', url: `${env.API_URL.replace(/\/$/, '')}/api/v1/health`, expect: 'ok' },
] as const

/** Estado por alvo, em memória: um restart do worker esquece uma queda em curso e, no pior caso, avisa de novo. */
const states = new Map<string, ProbeState>()

export const monitorSite = async (): Promise<void> => {
  const now = Date.now()
  const results = await Promise.all(
    TARGETS.map(async (target) => ({ target, result: await probeUrl(target.url, target.expect) })),
  )

  const down: { name: string; url: string; detail: string }[] = []
  const up: { name: string; downMinutes: number }[] = []

  for (const { target, result } of results) {
    const step = advanceProbe(states.get(target.name) ?? INITIAL_PROBE_STATE, result.up, now)
    states.set(target.name, step.state)

    if (!result.up) logger.warn({ target: target.name, detail: result.detail }, 'monitor: a sonda falhou')
    if (step.event === 'down') down.push({ name: target.name, url: target.url, detail: result.detail })
    if (step.event === 'up') up.push({ name: target.name, downMinutes: step.downMinutes ?? 1 })
  }

  if (down.length > 0) {
    logger.error({ targets: down.map((t) => t.name) }, 'monitor: fora do ar')
    await notifySiteStatus({ kind: 'down', targets: down })
  }
  if (up.length > 0) {
    logger.info({ targets: up.map((t) => t.name) }, 'monitor: de volta ao ar')
    await notifySiteStatus({ kind: 'up', targets: up })
  }
}
