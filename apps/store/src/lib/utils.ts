import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from '@ecommerce/shared/constants'

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))

/**
 * Dinheiro trafega e é armazenado em centavos (Int) do banco até aqui.
 * Esta função é a ÚNICA borda onde ele vira texto — e onde a divisão por 100
 * acontece. Fazer essa conta em qualquer outro lugar é como centavo vira float.
 */
export const formatBRL = (cents: number): string =>
  new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency: DEFAULT_CURRENCY.code,
  }).format(cents / 100)

export const formatDate = (value: string | Date): string =>
  new Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: 'short' }).format(new Date(value))
