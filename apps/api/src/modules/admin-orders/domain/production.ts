import { addBusinessDays } from '@ecommerce/shared/contracts'
import { spDayKey, spHourKey, spWeekday } from '@ecommerce/shared/utils'

/**
 * A fila de produção em funções puras: em que pé está o prazo de cada encomenda
 * e se é hora do resumo do dia. Recebem `now` — testar "vence amanhã" sem fixar
 * o presente é testar o relógio.
 */

export type DeadlineState = 'OVERDUE' | 'DUE_SOON' | 'OK'

/**
 * Atrasada = o DIA do prazo já passou (no calendário brasileiro). Vence logo =
 * o prazo cai hoje ou no próximo dia útil — na sexta, a de segunda já entra.
 */
export const productionDeadlineState = (p: { dueAt: Date; now: Date }): DeadlineState => {
  const dueDay = spDayKey(p.dueAt)
  if (dueDay < spDayKey(p.now)) return 'OVERDUE'
  return dueDay <= spDayKey(addBusinessDays(p.now, 1)) ? 'DUE_SOON' : 'OK'
}

/** O resumo sai a partir das 8h de Brasília, só em dia útil — o dia de quem produz. */
export const PRODUCTION_DIGEST_HOUR = 8

export const isProductionDigestTime = (now: Date): boolean => {
  const weekday = spWeekday(now)
  if (weekday === 0 || weekday === 6) return false
  return Number(spHourKey(now).slice(11, 13)) >= PRODUCTION_DIGEST_HOUR
}
