import { z } from 'zod'

/**
 * Posts do Instagram exibidos na seção "No Instagram" da home. Sem API da Meta:
 * o staff cola o link, a API busca a imagem pública do post e a re-hospeda no
 * nosso storage (a URL da CDN do Instagram é assinada e expira em dias).
 */

// `/p/`, `/reel/` e `/tv/` são o mesmo recurso para o Instagram: todos abrem em
// `/p/{code}/`. O username opcional antes cobre links copiados do app
// ("instagram.com/arte_no_jardim/p/…"). Regex e não `new URL`: o pacote não
// assume DOM nem Node.
const POST_URL =
  /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]{5,64})\/?(?:[?#].*)?$/i

/**
 * Função pura, compartilhada: o admin rejeita o link antes de chamar a API, e a
 * API refaz a mesma checagem — as duas pontas não podem divergir.
 */
export const parseInstagramPostUrl = (
  raw: string,
): { shortcode: string; permalink: string } | null => {
  const match = POST_URL.exec(raw.trim())
  if (!match) return null

  const shortcode = match[1]!
  return { shortcode, permalink: `https://www.instagram.com/p/${shortcode}/` }
}

export const createInstagramPostSchema = z.object({
  url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => parseInstagramPostUrl(v) !== null, 'Link de post do Instagram inválido'),
  /**
   * Fallback manual: quando o Instagram não entrega a imagem, o staff sobe o
   * arquivo pelo uploader e reenvia o mesmo link com o id do upload.
   */
  imageId: z.string().min(1).optional(),
})

export type CreateInstagramPostInput = z.infer<typeof createInstagramPostSchema>

/** A lista INTEIRA na nova ordem: a posição é o índice. */
export const reorderInstagramPostsSchema = z.object({
  ids: z.array(z.string().min(1)).max(200),
})

export type ReorderInstagramPostsInput = z.infer<typeof reorderInstagramPostsSchema>

/** A visão do STAFF. */
export const instagramPostSchema = z.object({
  id: z.string(),
  shortcode: z.string(),
  permalink: z.string(),
  caption: z.string().nullable(),
  imageId: z.string(),
  /** Derivada da key do Upload a cada leitura, nunca persistida. */
  imageUrl: z.string(),
  position: z.number().int(),
  createdAt: z.string(),
})

export type InstagramPost = z.infer<typeof instagramPostSchema>

/** O que a loja recebe: só o que o tile pinta, já ordenado. */
export const publicInstagramPostSchema = instagramPostSchema.pick({
  id: true,
  permalink: true,
  caption: true,
  imageUrl: true,
})

export type PublicInstagramPost = z.infer<typeof publicInstagramPostSchema>
