import { z } from 'zod'

export const BR_STATES = [
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PR', name: 'Paraná' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'TO', name: 'Tocantins' },
] as const

export const BR_STATE_CODES = BR_STATES.map((s) => s.code)

export const brStateSchema = z.enum(
  BR_STATE_CODES as unknown as [string, ...string[]],
  { message: 'UF inválida' },
)

export const DOCUMENT_TYPES = ['CPF', 'CNPJ'] as const
export const documentTypeSchema = z.enum(DOCUMENT_TYPES)
export type DocumentType = z.infer<typeof documentTypeSchema>

/**
 * Dígitos verificadores do CPF (módulo 11). Sequência repetida (111.111.111-11)
 * passa na conta mas não existe: a Receita nunca emite, e é o "CPF de teste" que
 * todo mundo digita.
 */
export const isValidCpf = (value: string): boolean => {
  const d = value.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const check = (len: number): number => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return check(9) === Number(d[9]) && check(10) === Number(d[10])
}

/** CPF normalizado: 11 dígitos, sem máscara, com dígitos verificadores válidos. */
export const cpfSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(z.string().refine(isValidCpf, 'CPF inválido'))

/** CEP normalizado: 8 dígitos, sem hífen. A máscara é da UI, o dado é limpo. */
export const zipCodeSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(z.string().length(8, 'CEP deve ter 8 dígitos'))

export const CURRENCY = {
  BRL: { code: 'BRL', symbol: 'R$', locale: 'pt-BR', decimals: 2 },
} as const

export const DEFAULT_CURRENCY = CURRENCY.BRL
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'
export const DEFAULT_LOCALE = 'pt-BR'
export const DEFAULT_COUNTRY = 'BR'
