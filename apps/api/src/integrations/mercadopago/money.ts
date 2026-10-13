/**
 * O MP fala em reais como string decimal ("19.99"); nós, em centavos Int. A
 * conversão é por texto, nunca por float: 19.99 * 100 dá 1998.9999999999998.
 */

export const centsToMp = (cents: number): string => {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`valor em centavos inválido: ${cents}`)
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

export const mpToCents = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === '') return 0
  const text = String(value).trim()
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) throw new Error(`valor do Mercado Pago em formato inesperado: ${text}`)
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'))
}
