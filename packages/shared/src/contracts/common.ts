import { z } from 'zod'

/**
 * Envelope `data`. Existe para que acrescentar `meta` nunca seja breaking change:
 * um array cru virando `{data, meta}` quebraria todo cliente.
 */
export const dataResponse = <T extends z.ZodType>(schema: T) =>
  z.object({ data: schema })

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
})

export type PaginationMeta = z.infer<typeof paginationMetaSchema>

export const paginatedResponse = <T extends z.ZodType>(schema: T) =>
  z.object({ data: z.array(schema), meta: paginationMetaSchema })

export const MAX_PER_PAGE = 100
export const DEFAULT_PER_PAGE = 24

/**
 * `?perPage=999999` é um DoS de uma linha. O teto mora aqui e não é negociável
 * pelo cliente. `coerce` porque query string chega como texto.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

/**
 * Ordenação com prefixo `-` para descendente. `allowed` é allowlist obrigatória:
 * `sort` livre deixa o cliente ordenar por coluna sem índice e derrubar o banco.
 */
export const sortQuerySchema = <const T extends readonly [string, ...string[]]>(allowed: T) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined
      const desc = v.startsWith('-')
      const field = desc ? v.slice(1) : v
      return { field, direction: desc ? ('desc' as const) : ('asc' as const) }
    })
    .refine((v) => !v || (allowed as readonly string[]).includes(v.field), {
      message: `Ordenação permitida apenas por: ${allowed.join(', ')}`,
    })

export const cuidSchema = z.string().min(1)
export const slugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug inválido')

export const emailSchema = z.string().email('E-mail inválido').toLowerCase().trim()

/**
 * Senha: comprimento mínimo alto vence composição obrigatória.
 * `P@ss1` satisfaz "maiúscula+número+símbolo" e cai em qualquer wordlist;
 * uma frase de 12 caracteres, não.
 */
export const passwordSchema = z
  .string()
  .min(12, 'A senha deve ter ao menos 12 caracteres')
  .max(200)

/** Dinheiro é sempre Int em centavos. Nunca float, nunca string. */
export const moneySchema = z.number().int().nonnegative()
