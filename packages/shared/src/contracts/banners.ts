import { z } from 'zod'

/**
 * Formato HTTP dos banners do carrossel da home. O admin valida os formulários
 * com estes mesmos schemas — mudar um campo aqui quebra o build no mesmo commit.
 *
 * Mínimo de propósito: sem agendamento e sem segmentação até um pedido real do
 * lojista (gatilhos de revisão em docs/arquitetura.md).
 */

export const createBannerSchema = z.object({
  title: z.string().min(1, 'Informe o título').max(140).trim(),
  subtitle: z.string().max(400).optional(),
  buttonLabel: z.string().max(40).optional(),
  /*
   * Caminho relativo ("/categorias/velas") ou URL completa. Validação leve de
   * propósito: quem cadastra é staff, e um regex de URL rígido só atrapalharia
   * âncoras e paths com query.
   */
  linkUrl: z.string().max(500).trim().optional(),
  imageId: z.string().nullable().optional(),
  position: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
})

export type CreateBannerInput = z.infer<typeof createBannerSchema>

// partial(): no update todo campo é opcional, mas quando presente segue a mesma
// regra do create.
export const updateBannerSchema = createBannerSchema.partial()
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>

/** A visão do STAFF: tudo, inclusive o que está desativado. */
export const bannerSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  buttonLabel: z.string().nullable(),
  linkUrl: z.string().nullable(),
  imageId: z.string().nullable(),
  /** Derivada da key do Upload a cada leitura, nunca persistida. */
  imageUrl: z.string().nullable(),
  position: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Banner = z.infer<typeof bannerSchema>

/**
 * O que o visitante anônimo recebe: sem imageId (detalhe interno do storage)
 * nem isActive/posição (só ativos chegam, já ordenados). Resposta cacheável.
 */
export const publicBannerSchema = bannerSchema.pick({
  id: true,
  title: true,
  subtitle: true,
  buttonLabel: true,
  linkUrl: true,
  imageUrl: true,
})

export type PublicBanner = z.infer<typeof publicBannerSchema>
