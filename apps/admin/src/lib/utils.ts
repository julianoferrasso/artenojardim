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
