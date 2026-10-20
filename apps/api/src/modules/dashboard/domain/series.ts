import {
  addSpDays,
  daysBetween,
  granularityStart,
  spanDays,
  spDayStart,
  type DayKey,
  type DayRange,
  type Granularity,
} from '@ecommerce/shared/utils'

/**
 * A moldura do gráfico: os baldes do período atual e o equivalente de cada um no
 * período comparado. Puro — `now`/`today` entram como argumento.
 *
 * Posição = onde um fato cai: o dia ('YYYY-MM-DD') ou, por hora, 'YYYY-MM-DDTHH'.
 */

export type SeriesFrame = {
  granularity: Granularity
  /** Início de cada balde no período atual. */
  keys: string[]
  /** Início equivalente no comparado; null quando o comparado é mais curto e não chega lá. */
  previousKeys: Array<string | null>
  /** Último dia de cada balde no período atual. */
  lastDays: DayKey[]
  /** Último dia do balde equivalente no comparado. */
  previousLastDays: Array<DayKey | null>
  /** Em que balde cai uma posição do período ATUAL. */
  indexOf: (position: string) => number | null
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * O 1º balde de semana/mês começa no `from`, mesmo no meio da semana: o gráfico
 * não pode mostrar dias que ninguém pediu. Os seguintes começam no domingo / dia 1.
 */
export const buildFrame = (
  period: DayRange,
  comparison: DayRange | null,
  granularity: Granularity,
): SeriesFrame => {
  if (granularity === 'hour') {
    const keys = Array.from({ length: 24 }, (_, h) => `${period.from}T${pad2(h)}`)
    return {
      granularity,
      keys,
      previousKeys: keys.map((_, h) => (comparison ? `${comparison.from}T${pad2(h)}` : null)),
      lastDays: keys.map(() => period.from),
      previousLastDays: keys.map(() => comparison?.from ?? null),
      indexOf: (position) =>
        position.length === 13 && position.slice(0, 10) === period.from ? Number(position.slice(11, 13)) : null,
    }
  }

  const keys: DayKey[] = []
  const indexByDay = new Map<DayKey, number>()
  const total = spanDays(period)
  for (let i = 0; i < total; i++) {
    const day = addSpDays(period.from, i)
    if (i === 0 || granularityStart(day, granularity) === day) keys.push(day)
    indexByDay.set(day, keys.length - 1)
  }

  const lastDays = keys.map((_, i) => (i + 1 < keys.length ? addSpDays(keys[i + 1]!, -1) : period.to))

  const comparisonSpan = comparison ? spanDays(comparison) : 0
  const previousKeys = keys.map((start) => {
    if (!comparison) return null
    const offset = daysBetween(period.from, start)
    return offset < comparisonSpan ? addSpDays(comparison.from, offset) : null
  })
  const previousLastDays = keys.map((start, i) => {
    const previousStart = previousKeys[i]
    if (!comparison || !previousStart) return null
    const last = addSpDays(previousStart, daysBetween(start, lastDays[i]!))
    return last > comparison.to ? comparison.to : last
  })

  return {
    granularity,
    keys,
    previousKeys,
    lastDays,
    previousLastDays,
    indexOf: (position) => indexByDay.get(position.slice(0, 10)) ?? null,
  }
}

/**
 * Leva uma posição do comparado para o dia equivalente do atual
 * (`from + (dia − compareFrom)`). Alinhar por índice de balde compararia, numa
 * semana parcial, 4 dias contra 6. Fora do período atual → null: o comparado mais
 * longo (31 contra 30 dias) entra nos totais, não no gráfico.
 */
export const projectToCurrent = (position: string, period: DayRange, comparison: DayRange): string | null => {
  const projected = addSpDays(period.from, daysBetween(comparison.from, position.slice(0, 10)))
  if (projected < period.from || projected > period.to) return null
  return `${projected}${position.slice(10)}`
}

/**
 * Quando o período termina HOJE, o dia de hoje ainda está pela metade: comparar
 * com o último dia do comparado inteiro inventa uma queda (às 10h, "hoje" perde
 * de "ontem" por 70%). O corte leva o comparado até a mesma hora de agora — vale
 * para os TOTAIS; o gráfico mostra o comparado inteiro como referência.
 */
export const comparisonCutoff = (
  period: DayRange,
  comparison: DayRange | null,
  today: DayKey,
  now: Date,
): Date | null => {
  if (!comparison || period.to !== today) return null
  const elapsed = now.getTime() - spDayStart(today).getTime()
  return new Date(spDayStart(comparison.to).getTime() + elapsed)
}
