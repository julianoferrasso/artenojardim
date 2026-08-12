import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from '@ecommerce/shared/constants'

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))

/**
 * Aparência de um <input> das telas de conta (entrar, cadastrar, recuperar
 * senha). Uma constante e não uma quinta cópia da mesma string: é assim que os
 * campos continuam idênticos entre as páginas quando uma delas mudar.
 */
export const fieldClass =
  'h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'

/** O botão de ação primária dessas mesmas telas. */
export const submitButtonClass =
  'h-11 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-soft transition-all duration-200 hover:bg-primary/90 disabled:opacity-50'

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
