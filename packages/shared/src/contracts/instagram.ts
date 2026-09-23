import { z } from 'zod'
import { instagramDisplayModeSchema } from '../constants/enums.js'

/**
 * Posts da seção "No Instagram" da home. Sem API da Meta (o oEmbed exige app
 * aprovado e, desde 03/11/2025, nem devolve mais a miniatura). Dois modos:
 *
 *   IMAGE — a API busca a imagem pública do post e a re-hospeda no nosso
 *           storage (a URL da CDN do Instagram é assinada e expira em dias).
 *   EMBED — a loja monta o blockquote oficial e o embed.js do Instagram o
 *           troca por um iframe (vídeo, carrossel, curtidas).
 */

/** Teto da vitrine. Pausados não contam: o lojista guarda quantos quiser. */
export const INSTAGRAM_MAX_ACTIVE_POSTS = 18

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

const PERMALINK_ATTR = /data-instgrm-permalink="([^"]+)"/i
const FIRST_POST_HREF = /href="(https?:\/\/(?:www\.)?instagram\.com\/[^"]+)"/i

export type ParsedInstagramInput = {
  shortcode: string
  permalink: string
  kind: 'link' | 'embed'
  captioned: boolean
}

/**
 * Aceita o link OU o código do "Incorporar". Do código só saem o shortcode e a
 * flag de legenda: o HTML colado NUNCA é guardado nem renderizado — a loja
 * remonta o blockquote a partir de um template próprio. Guardar o HTML seria
 * XSS armazenado esperando um `<script>` colado junto.
 */
export const parseInstagramInput = (raw: string): ParsedInstagramInput | null => {
  const text = raw.trim()
  const isEmbed = /instagram-media|<blockquote/i.test(text)

  if (!isEmbed) {
    const link = parseInstagramPostUrl(text)
    return link ? { ...link, kind: 'link', captioned: false } : null
  }

  const href = PERMALINK_ATTR.exec(text)?.[1] ?? FIRST_POST_HREF.exec(text)?.[1]
  if (!href) return null
  const link = parseInstagramPostUrl(href.replace(/&amp;/g, '&'))
  if (!link) return null

  return { ...link, kind: 'embed', captioned: /data-instgrm-captioned/i.test(text) }
}

export const createInstagramPostSchema = z.object({
  /** Link do post ou o código inteiro do "Incorporar" (~5 KB). */
  source: z
    .string()
    .trim()
    .max(20000)
    .refine(
      (v) => parseInstagramInput(v) !== null,
      'Cole o link de um post do Instagram ou o código do "Incorporar"',
    ),
  displayMode: instagramDisplayModeSchema,
  /**
   * Fallback manual do modo IMAGE: quando o Instagram não entrega a imagem, o
   * staff sobe o arquivo pelo uploader e reenvia o mesmo post com o id do upload.
   */
  imageId: z.string().min(1).optional(),
})

export type CreateInstagramPostInput = z.infer<typeof createInstagramPostSchema>

export const updateInstagramPostSchema = z
  .object({
    isActive: z.boolean().optional(),
    displayMode: instagramDisplayModeSchema.optional(),
  })
  .refine((v) => v.isActive !== undefined || v.displayMode !== undefined, 'Nada para alterar')

export type UpdateInstagramPostInput = z.infer<typeof updateInstagramPostSchema>

/** A lista INTEIRA na nova ordem: a posição é o índice. */
export const reorderInstagramPostsSchema = z.object({
  ids: z.array(z.string().min(1)).max(200),
})

export type ReorderInstagramPostsInput = z.infer<typeof reorderInstagramPostsSchema>

/** A visão do STAFF: inclui os pausados. */
export const instagramPostSchema = z.object({
  id: z.string(),
  shortcode: z.string(),
  permalink: z.string(),
  caption: z.string().nullable(),
  displayMode: instagramDisplayModeSchema,
  /** Só vale para EMBED: o iframe mostra a legenda embaixo da mídia. */
  captioned: z.boolean(),
  isActive: z.boolean(),
  imageId: z.string().nullable(),
  /**
   * Derivada da key do Upload a cada leitura, nunca persistida. Pode faltar em
   * EMBED: lá a imagem é só miniatura, e a busca dela é de melhor esforço.
   */
  imageUrl: z.string().nullable(),
  position: z.number().int(),
  createdAt: z.string(),
})

export type InstagramPost = z.infer<typeof instagramPostSchema>

/** O que a loja recebe: só ativos, já ordenados. */
export const publicInstagramPostSchema = instagramPostSchema.pick({
  id: true,
  shortcode: true,
  permalink: true,
  caption: true,
  displayMode: true,
  captioned: true,
  imageUrl: true,
})

export type PublicInstagramPost = z.infer<typeof publicInstagramPostSchema>
