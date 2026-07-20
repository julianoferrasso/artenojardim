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

/**
 * Slug opcional que trata string vazia como AUSENTE.
 *
 * O formulário manda `slug: ''` quando o campo fica em branco (o usuário
 * esperando geração automática). `slugSchema.optional()` só cobre `undefined`,
 * então `''` caía no min(1) e dava "Slug inválido" — o oposto de automático.
 *
 * O input continua `string` (o React Hook Form registra um campo de texto), e a
 * SAÍDA vira `string | undefined`: `''` e undefined viram undefined, e aí o
 * backend gera do nome. `transform` (não `preprocess`) preserva o tipo de input.
 */
export const optionalSlugSchema = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(slugSchema.optional())

export const emailSchema = z.string().email('E-mail inválido').toLowerCase().trim()

/**
 * Senha: mínimo de 6, sem exigir composição.
 *
 * 6 caracteres é curto e cabe em wordlist — a escolha é deliberada, por
 * usabilidade. Quem segura ataque de força bruta aqui é o `loginLimiter`
 * (middlewares/rate-limit.ts), não o comprimento: sem rate limit, nem 12
 * caracteres salvam; com ele, o atacante não chega a tentar.
 *
 * Não exigimos maiúscula+número+símbolo de propósito: `P@ss1` satisfaz a regra
 * e é pior que uma frase curta. Composição obrigatória empurra o usuário para
 * padrões previsíveis e para o post-it.
 */
export const passwordSchema = z
  .string()
  .min(6, 'A senha deve ter ao menos 6 caracteres')
  .max(200)

/** Dinheiro é sempre Int em centavos. Nunca float, nunca string. */
export const moneySchema = z.number().int().nonnegative()
