import { DEFAULT_TIMEZONE } from '../constants/brazil.js'

/**
 * O dia do calendário brasileiro, para código que roda em UTC.
 *
 * A VPS roda em UTC. Sem isto, `toISOString().slice(0,10)` responde "que dia é
 * em Londres" — e às 21h de Brasília a resposta já é o dia seguinte. Foi
 * exatamente esse o bug do gráfico de receita do painel.
 *
 * Aqui NÃO se usa offset fixo `-03:00`, embora ele esteja correto hoje (o Brasil
 * não tem horário de verão desde 2019). O motivo é o modo de falha: se o horário
 * de verão voltar, offset fixo não quebra alto — ele grava data errada em
 * silêncio por quatro meses. `Intl` usa o tzdata do Node e acompanha a mudança.
 *
 * Nada aqui lê `process.env.TZ`: o fuso é sempre nomeado. É o que faz o
 * comportamento ser igual na sua máquina e na VPS.
 */

/** 'YYYY-MM-DD'. É um dia de CALENDÁRIO, não um instante — não tem hora nem fuso. */
export type DayKey = string

/** en-CA formata como YYYY-MM-DD direto, sem formatToParts nem concatenação. */
const KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: DEFAULT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** `hourCycle: 'h23'` é obrigatório: sem ele meia-noite volta como hora '24'. */
const PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: DEFAULT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: DEFAULT_TIMEZONE,
  weekday: 'short',
})

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

/** Em que dia brasileiro caiu este instante. */
export const spDayKey = (instant: Date): DayKey => KEY_FORMATTER.format(instant)

/**
 * Quanto o fuso estava adiantado/atrasado em relação ao UTC NAQUELE instante,
 * em milissegundos. Medido, não assumido — é o que dispensa tabela de offsets.
 */
const offsetAt = (instant: Date): number => {
  const parts = PARTS_FORMATTER.formatToParts(instant)
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0)

  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
    instant.getUTCMilliseconds(),
  )
  return asIfUtc - instant.getTime()
}

/**
 * Instante UTC correspondente a uma hora da parede brasileira.
 *
 * Duas passadas de propósito: a primeira chuta o offset a partir de um instante
 * provisório, a segunda confirma com o offset do instante corrigido. Só diferem
 * em transição de horário de verão — e é justamente por isso que a segunda fica.
 */
const spWallClockToInstant = (day: DayKey, hours: number, minutes: number, seconds: number, ms: number): Date => {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const naive = Date.UTC(year, month - 1, date, hours, minutes, seconds, ms)

  const firstGuess = new Date(naive - offsetAt(new Date(naive)))
  return new Date(naive - offsetAt(firstGuess))
}

/** Primeiro instante do dia brasileiro. Para filtrar coluna `timestamp` com `gte`. */
export const spDayStart = (day: DayKey): Date => spWallClockToInstant(day, 0, 0, 0, 0)

/**
 * Último instante do dia brasileiro (.999). Para `lte` inclusivo.
 * `.999` é o último valor representável em `TIMESTAMP(3)` — a precisão das
 * nossas colunas. Com precisão de microssegundo isto vazaria.
 */
export const spDayEnd = (day: DayKey): Date => spWallClockToInstant(day, 23, 59, 59, 999)

/**
 * Meia-noite UTC do dia — o formato que o Prisma usa em coluna `@db.Date`.
 *
 * NÃO é `spDayStart`. Uma coluna `date` não guarda instante: guarda o dia, e o
 * Prisma o serializa a partir dos componentes UTC. Confundir os dois faz o
 * filtro perder o dia mais antigo da janela.
 */
export const spDayAsDateColumn = (day: DayKey): Date => new Date(`${day}T00:00:00.000Z`)

/**
 * Soma dias de CALENDÁRIO sobre a chave. Opera na string via UTC, sem tocar em
 * fuso — andar no calendário não é a mesma coisa que somar 24h, e fazer isso em
 * `Date` local é onde a aritmética de data costuma errar.
 */
export const addSpDays = (day: DayKey, n: number): DayKey => {
  const base = new Date(`${day}T00:00:00.000Z`)
  base.setUTCDate(base.getUTCDate() + n)
  return base.toISOString().slice(0, 10)
}

/** Dia da semana no fuso brasileiro (0 = domingo). "É fim de semana?" é pergunta local. */
export const spWeekday = (instant: Date): number =>
  WEEKDAY_INDEX[WEEKDAY_FORMATTER.format(instant)] ?? 0
