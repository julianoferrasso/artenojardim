import { z } from 'zod'
import { hexColorSchema } from './store.js'

/**
 * Formato HTTP dos banners do carrossel da home. O admin valida os formulários
 * com estes mesmos schemas — mudar um campo aqui quebra o build no mesmo commit.
 *
 * Mínimo de propósito: sem agendamento e sem segmentação até um pedido real do
 * lojista (gatilhos de revisão em docs/arquitetura.md).
 */

/**
 * O fundo que prolonga a borda da foto para trás do texto. O admin amostra a
 * foto no navegador; a loja só pinta — não baixa a foto para medir.
 *
 * `left` são faixas da borda esquerda, de cima para baixo (desktop: a foto fica
 * à direita e o texto à esquerda). `bottom` são faixas da borda de baixo, da
 * esquerda para a direita (celular: a foto fica em cima e o texto embaixo).
 * `custom` é a cor escolhida à mão, gravada como uma faixa só nos dois lados.
 */
export const bannerBackdropSchema = z.object({
  source: z.enum(['image', 'custom']),
  left: z.array(hexColorSchema).min(1).max(8),
  bottom: z.array(hexColorSchema).min(1).max(8),
})

export type BannerBackdrop = z.infer<typeof bannerBackdropSchema>

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
  // Sem .default(): o partial() do update o reaplicaria e apagaria o fundo salvo.
  backdrop: bannerBackdropSchema.nullable().optional(),
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
  /** Do Upload; null quando o navegador não conseguiu medir no envio. */
  imageWidth: z.number().int().nullable(),
  imageHeight: z.number().int().nullable(),
  backdrop: bannerBackdropSchema.nullable(),
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
  imageWidth: true,
  imageHeight: true,
  backdrop: true,
})

export type PublicBanner = z.infer<typeof publicBannerSchema>
