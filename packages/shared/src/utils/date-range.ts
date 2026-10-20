import { addSpDays, type DayKey } from './date-br.js'

/**
 * Intervalos de calendário do dashboard: presets, período de comparação e
 * granularidade. Puro — "hoje" entra como argumento (quem chama usa
 * `spDayKey(new Date())`) — porque admin e API precisam chegar exatamente aos
 * mesmos dias: o admin para desenhar o seletor, a API para validar e consultar.
 *
 * Tudo opera sobre a chave 'YYYY-MM-DD', nunca sobre `Date` local: andar no
 * calendário não é somar 24h, e é aí que a aritmética de data costuma errar.
 */

export type DayRange = { from: DayKey; to: DayKey }

export const DASHBOARD_PRESETS = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'last90',
  'last365',
  'thisWeek',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'lastYear',
] as const
export type DashboardPreset = (typeof DASHBOARD_PRESETS)[number]

export const COMPARISON_MODES = ['previous_period', 'previous_year', 'none'] as const
export type ComparisonMode = (typeof COMPARISON_MODES)[number]

export const GRANULARITIES = ['hour', 'day', 'week', 'month'] as const
export type Granularity = (typeof GRANULARITIES)[number]

/**
 * Dois anos: cobre "ano passado contra o retrasado" e mantém a consulta ao vivo
 * barata. Passar disso é relatório, não painel.
 */
export const MAX_RANGE_DAYS = 731

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

/**
 * Formato E data real. A regex sozinha aceita 2026-02-30; o round-trip pelo
 * calendário denuncia (o `Date` rola para 02/03).
 */
export const isDayKey = (value: string): boolean => {
  if (!DAY_KEY_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** 0 = domingo. Meio-dia UTC não troca de dia em fuso nenhum. */
export const dayKeyWeekday = (day: DayKey): number => new Date(`${day}T12:00:00.000Z`).getUTCDay()

/** Quantos dias o intervalo cobre, contando as duas pontas. */
export const spanDays = (range: DayRange): number =>
  Math.round((Date.parse(`${range.to}T00:00:00.000Z`) - Date.parse(`${range.from}T00:00:00.000Z`)) / DAY_MS) +
  1

const pad2 = (n: number): string => String(n).padStart(2, '0')

const splitDay = (day: DayKey): { y: number; m: number; d: number } => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return { y, m, d }
}

/** `m` de 1 a 12. O dia 0 do mês seguinte é o último deste. */
const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()

const startOfMonth = (day: DayKey): DayKey => `${day.slice(0, 7)}-01`

const endOfMonth = (day: DayKey): DayKey => {
  const { y, m } = splitDay(day)
  return `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`
}

/**
 * Anda `n` meses mantendo o dia, com teto no fim do mês: 31/03 − 1 mês = 28/02,
 * não 03/03. É o que faz "este mês até o dia 31" comparar com o mês anterior
 * inteiro, e 29/02 − 1 ano cair em 28/02.
 */
const addMonthsClamped = (day: DayKey, n: number): DayKey => {
  const { y, m, d } = splitDay(day)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${pad2(nm)}-${pad2(Math.min(d, daysInMonth(ny, nm)))}`
}

/** Semana começando no DOMINGO, como o calendário pt-BR que o admin desenha. */
const startOfWeek = (day: DayKey): DayKey => addSpDays(day, -dayKeyWeekday(day))

export const resolvePreset = (preset: DashboardPreset, today: DayKey): DayRange => {
  const lastDays = (n: number): DayRange => ({ from: addSpDays(today, -(n - 1)), to: today })
  const year = splitDay(today).y

  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const yesterday = addSpDays(today, -1)
      return { from: yesterday, to: yesterday }
    }
    case 'last7':
      return lastDays(7)
    case 'last30':
      return lastDays(30)
    case 'last90':
      return lastDays(90)
    case 'last365':
      return lastDays(365)
    case 'thisWeek':
      return { from: startOfWeek(today), to: today }
    case 'thisMonth':
      return { from: startOfMonth(today), to: today }
    case 'lastMonth': {
      const start = addMonthsClamped(startOfMonth(today), -1)
      return { from: start, to: endOfMonth(start) }
    }
    case 'thisYear':
      return { from: `${year}-01-01`, to: today }
    case 'lastYear':
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
  }
}

/** O que o seletor escolheu: um preset (que carrega significado de calendário) ou datas livres. */
export type RangeSelection = { preset: DashboardPreset | null; range: DayRange }

const shiftYears = (range: DayRange, n: number): DayRange => ({
  from: addMonthsClamped(range.from, 12 * n),
  to: addMonthsClamped(range.to, 12 * n),
})

/**
 * O intervalo com que o período é comparado.
 *
 * "Período anterior" respeita o calendário quando o preset tem um: "este mês"
 * (01 a 20/10) compara com 01 a 20/09 — é a pergunta que o lojista faz ("como
 * estou em relação ao mesmo ponto do mês passado?"). "Mês passado" compara com o
 * mês inteiro antes dele, mesmo que tenha outro número de dias. Intervalos
 * móveis e datas livres comparam com a mesma duração imediatamente antes.
 */
export const resolveComparison = (selection: RangeSelection, mode: ComparisonMode): DayRange | null => {
  const { preset, range } = selection
  if (mode === 'none') return null
  if (mode === 'previous_year') return shiftYears(range, -1)

  switch (preset) {
    case 'thisWeek':
      return { from: addSpDays(range.from, -7), to: addSpDays(range.to, -7) }
    case 'thisMonth':
      return { from: addMonthsClamped(range.from, -1), to: addMonthsClamped(range.to, -1) }
    case 'thisYear':
      return shiftYears(range, -1)
    case 'lastMonth': {
      const start = addMonthsClamped(range.from, -1)
      return { from: start, to: endOfMonth(start) }
    }
    case 'lastYear':
      return shiftYears(range, -1)
    default: {
      const length = spanDays(range)
      return { from: addSpDays(range.from, -length), to: addSpDays(range.from, -1) }
    }
  }
}

/**
 * Agrupamentos que fazem sentido para a duração. Hora só num dia (24 pontos);
 * dia até um ano (mais que isso vira poeira no gráfico); semana e mês só quando
 * cabem ao menos duas barras inteiras.
 */
export const allowedGranularities = (span: number): Granularity[] => {
  if (span <= 1) return ['hour']
  const allowed: Granularity[] = []
  if (span <= 366) allowed.push('day')
  if (span >= 14) allowed.push('week')
  if (span >= 60) allowed.push('month')
  return allowed
}

/** O agrupamento quando ninguém escolheu: o mais fino que ainda dá um gráfico legível. */
export const autoGranularity = (span: number): Granularity => {
  if (span <= 1) return 'hour'
  if (span <= 92) return 'day'
  if (span <= 200) return 'week'
  return 'month'
}

/** Início da semana/mês de um dia — a chave do balde no gráfico. */
export const granularityStart = (day: DayKey, granularity: Exclude<Granularity, 'hour'>): DayKey => {
  if (granularity === 'week') return startOfWeek(day)
  if (granularity === 'month') return startOfMonth(day)
  return day
}

/** Diferença em dias de calendário entre duas chaves (b − a). */
export const daysBetween = (a: DayKey, b: DayKey): number =>
  Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / DAY_MS)
