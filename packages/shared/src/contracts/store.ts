import { z } from 'zod'

/**
 * Flags PÚBLICAS. A loja e o admin leem daqui para esconder o que ainda não
 * está no ar. Flag liga/desliga o que JÁ está pronto — código pela metade é branch.
 */
export const publicFlagsSchema = z.object({
  reviews: z.boolean(),
  wishlist: z.boolean(),
  giftCards: z.boolean(),
})

export type PublicFlags = z.infer<typeof publicFlagsSchema>

export const storeAddressSchema = z.object({
  zipCode: z.string(),
  street: z.string(),
  number: z.string(),
  complement: z.string().nullable(),
  district: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
})

/**
 * O que a loja pública precisa saber sobre a Store. NÃO expõe `document`,
 * `id` nem nada operacional — é resposta pública, cacheável.
 */
export const publicStoreSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  currency: z.string(),
  locale: z.string(),
  timezone: z.string(),
  flags: publicFlagsSchema,
})

export type PublicStore = z.infer<typeof publicStoreSchema>

export const publicStoreResponseSchema = z.object({ data: publicStoreSchema })

export const healthResponseSchema = z.object({
  data: z.object({
    status: z.literal('ok'),
    version: z.string(),
    uptime: z.number(),
    database: z.enum(['up', 'down']),
  }),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
