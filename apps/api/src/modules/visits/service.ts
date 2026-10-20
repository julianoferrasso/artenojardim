import type { TrackVisitInput } from '@ecommerce/shared/contracts'
import { spDayAsDateColumn, spHourKey } from '@ecommerce/shared/utils'
import { prisma } from '../../config/prisma.js'
import { logger } from '../../config/logger.js'
import { isProduction } from '../../config/env.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { classifyDevice, classifySource, isBot } from './domain/classify.js'

/**
 * Conta uma visita. Quem decide que a sessão é nova é a loja (30 min sem
 * atividade ou virada do dia); aqui só se classifica e soma no rollup da hora.
 *
 * Best-effort como o registro de visualização de produto: nunca lança — métrica
 * não pode virar 500 num beacon.
 */
export const trackVisit = async (input: TrackVisitInput, userAgent: string): Promise<void> => {
  if (isBot(userAgent)) return

  const source = classifySource({ ...input, userAgent })
  const device = classifyDevice(userAgent)

  // O banco do desenvolvimento É o de produção: sem isto, cada `pnpm dev:store`
  // viraria visita real e inflaria o denominador da conversão.
  if (!isProduction) {
    logger.debug({ source, device }, 'visita classificada (não gravada fora de produção)')
    return
  }

  const storeId = getActiveStoreId()
  const hourKey = spHourKey(new Date())
  // A coluna é @db.Date: o dia vai como meia-noite UTC, não como instante.
  const date = spDayAsDateColumn(hourKey.slice(0, 10))
  const hour = Number(hourKey.slice(11, 13))

  try {
    await prisma.storeVisit.upsert({
      where: { storeId_date_hour_source_device: { storeId, date, hour, source, device } },
      create: { storeId, date, hour, source, device, count: 1 },
      update: { count: { increment: 1 } },
    })
  } catch (err) {
    // Inclui a corrida de dois primeiros acessos da mesma hora (P2002): perde-se
    // uma visita, que é o custo aceito no ProductView também.
    logger.warn({ err, source, device }, 'falha ao registrar visita')
  }
}
