import { logger } from '../config/logger.js'
import { renewMelhorEnvioToken } from './melhor-envio-token.js'
import { monitorSite } from './site-monitor.js'

/**
 * Varreduras periódicas — `jobs/` é cron; reação a fato consumado mora em `queues/`.
 *
 * `setInterval` e não node-cron: nenhum job aqui depende de hora do relógio, só
 * de frequência. Roda no worker (fork ×1, nunca cluster), então cada job executa
 * uma vez por intervalo — e não uma vez por instância.
 */

type Job = { name: string; everyMs: number; run: () => Promise<void> }

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

const JOBS: Job[] = [
  { name: 'melhor-envio-token', everyMs: 6 * HOUR_MS, run: renewMelhorEnvioToken },
  { name: 'site-monitor', everyMs: 2 * MINUTE_MS, run: monitorSite },
]

/** A primeira execução espera o boot assentar antes de ir à rede. */
const FIRST_RUN_DELAY_MS = 30_000

/** Agenda todos os jobs. Devolve a parada, para o shutdown do processo. */
export const startJobs = (): (() => void) => {
  const timeouts: NodeJS.Timeout[] = []
  const intervals: NodeJS.Timeout[] = []

  for (const job of JOBS) {
    // Uma execução lenta (rede pendurada) não pode empilhar outra por cima.
    let running = false
    const tick = async (): Promise<void> => {
      if (running) return
      running = true
      try {
        await job.run()
      } catch (err) {
        // Job nunca derruba o worker: o próximo intervalo tenta de novo.
        logger.error({ err, job: job.name }, 'job falhou')
      } finally {
        running = false
      }
    }

    timeouts.push(setTimeout(() => void tick(), FIRST_RUN_DELAY_MS))
    intervals.push(setInterval(() => void tick(), job.everyMs))
  }

  logger.info({ jobs: JOBS.map((j) => j.name) }, 'jobs agendados')

  return () => {
    for (const t of timeouts) clearTimeout(t)
    for (const i of intervals) clearInterval(i)
  }
}
