import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from '@ecommerce/shared/constants'

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))

/**
 * Duplicado de propósito com o mesmo arquivo da loja.
 *
 * Extrair packages/ui agora custaria configuração de build, Tailwind
 * compartilhado e um lugar a mais para olhar — para poupar 8 linhas. Extraia
 * quando a TERCEIRA cópia doer, não antes.
 */
export const formatBRL = (cents: number): string =>
  new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency: DEFAULT_CURRENCY.code,
  }).format(cents / 100)

export const formatDate = (value: string | Date): string =>
  new Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  )

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity],
]

/**
 * "há 3 horas". Arredonda para pelo menos 1 minuto: "há 0 minuto" leria como
 * erro, e "agora" não cabe em "aguardando há …".
 */
export const formatRelative = (value: string | Date, now: number = Date.now()): string => {
  let amount = Math.max(1, (now - new Date(value).getTime()) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(DEFAULT_LOCALE, { numeric: 'always' })

  for (const [unit, size] of RELATIVE_STEPS) {
    if (amount < size) return rtf.format(-Math.floor(amount), unit)
    amount /= size
  }
  return formatDate(value)
}
