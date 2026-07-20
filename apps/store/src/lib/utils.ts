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

/** "19 de julho de 2026" — para datas que o cliente lê, não confere. */
export const formatDateLong = (value: string | Date): string =>
  new Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: 'long' }).format(new Date(value))

/**
 * Data e hora. A timeline de um pedido costuma ter vários eventos no MESMO dia
 * ("pagamento aprovado" e "em separação"), e sem a hora eles parecem
 * simultâneos.
 */
export const formatDateTime = (value: string | Date): string =>
  new Intl.DateTimeFormat(DEFAULT_LOCALE, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  )
