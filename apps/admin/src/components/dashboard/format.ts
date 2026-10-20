import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from '@ecommerce/shared/constants'
import type { DashboardMetrics } from '@ecommerce/shared/contracts'
import type { DayKey, DayRange, Granularity } from '@ecommerce/shared/utils'
import { formatBRL } from '@/lib/utils'

/**
 * Formatação do painel. Datas são chaves de CALENDÁRIO ('YYYY-MM-DD'): viram
 * `Date` ao meio-dia UTC e são formatadas em UTC — nenhum fuso desloca o dia, e
 * o navegador em outro fuso mostra o mesmo dia que a API contou.
 */

const keyDate = (key: string): Date => new Date(`${key.slice(0, 10)}T12:00:00.000Z`)

const dateFormat = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone: 'UTC', ...options })

const MONTH_SHORT = dateFormat({ month: 'short' })
const MONTH_LONG = dateFormat({ month: 'long' })
const WEEKDAY_SHORT = dateFormat({ weekday: 'short' })

/** "out", não "out." — o ponto do pt-BR polui eixo e intervalo. */
const monthShort = (key: string): string => MONTH_SHORT.format(keyDate(key)).replace('.', '')

/** "20 out" ou "20 out 2026". */
export const formatDay = (key: DayKey, withYear = false): string =>
  `${Number(key.slice(8, 10))} ${monthShort(key)}${withYear ? ` ${key.slice(0, 4)}` : ''}`

/** "21 set – 20 out 2026"; o ano só aparece duas vezes quando muda. */
export const formatRange = (range: DayRange): string => {
  if (range.from === range.to) return formatDay(range.from, true)
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4)
  return `${formatDay(range.from, !sameYear)} – ${formatDay(range.to, true)}`
}

/** "20/10/2026" — para os campos De/Até do seletor. */
export const formatDayNumeric = (key: DayKey): string =>
  `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`

/** Rótulo de um balde do gráfico: curto no eixo, completo no tooltip e na tabela. */
export const formatBucket = (key: string, granularity: Granularity, mode: 'tick' | 'full'): string => {
  if (granularity === 'hour') return mode === 'tick' ? `${key.slice(11, 13)}h` : `${key.slice(11, 13)}:00`
  if (granularity === 'month') {
    return mode === 'tick'
      ? `${monthShort(key)}/${key.slice(2, 4)}`
      : `${MONTH_LONG.format(keyDate(key))} de ${key.slice(0, 4)}`
  }
  if (granularity === 'week') return mode === 'tick' ? formatDay(key) : `Semana de ${formatDay(key, true)}`
  return mode === 'tick'
    ? formatDay(key)
    : `${WEEKDAY_SHORT.format(keyDate(key)).replace('.', '')}, ${formatDay(key, true)}`
}

const COUNT = new Intl.NumberFormat(DEFAULT_LOCALE)
const COUNT_COMPACT = new Intl.NumberFormat(DEFAULT_LOCALE, { notation: 'compact', maximumFractionDigits: 1 })
const MONEY_COMPACT = new Intl.NumberFormat(DEFAULT_LOCALE, {
  style: 'currency',
  currency: DEFAULT_CURRENCY.code,
  notation: 'compact',
  maximumFractionDigits: 1,
})
const PERCENT = new Intl.NumberFormat(DEFAULT_LOCALE, {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const PERCENT_SIGNED = new Intl.NumberFormat(DEFAULT_LOCALE, {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

export const formatCount = (n: number): string => COUNT.format(n)
export const formatMoneyCompact = (cents: number): string => MONEY_COMPACT.format(cents / 100)
export const formatPercent = (ratio: number | null): string => (ratio === null ? '—' : PERCENT.format(ratio))
export const formatChange = (ratio: number): string => PERCENT_SIGNED.format(ratio)

/** Variação relativa. Sem base (anterior zero ou desconhecido) não há variação a mostrar. */
export const percentChange = (current: number | null, previous: number | null): number | null =>
  current === null || previous === null || previous === 0 ? null : (current - previous) / previous

export type MetricKey = keyof DashboardMetrics

export type MetricSpec = {
  label: string
  /** Valor cheio (tile, tooltip, tabela). */
  format: (value: number) => string
  /** Valor curto (eixo Y). */
  axis: (value: number) => string
}

/** Os cinco números do topo, na ordem em que o lojista lê. */
export const METRICS: Record<MetricKey, MetricSpec> = {
  revenue: { label: 'Receita', format: formatBRL, axis: formatMoneyCompact },
  orders: { label: 'Pedidos pagos', format: formatCount, axis: (v) => COUNT_COMPACT.format(v) },
  averageTicket: { label: 'Ticket médio', format: formatBRL, axis: formatMoneyCompact },
  visits: { label: 'Visitas', format: formatCount, axis: (v) => COUNT_COMPACT.format(v) },
  conversionRate: { label: 'Conversão', format: (v) => PERCENT.format(v), axis: (v) => PERCENT.format(v) },
}

export const METRIC_ORDER: MetricKey[] = ['revenue', 'orders', 'averageTicket', 'visits', 'conversionRate']
