import { ALLOWED_IMAGE_TYPES, ERROR_CODES, MAX_UPLOAD_BYTES } from '@ecommerce/shared/contracts'
import { appError } from '../../shared/errors.js'
import { logger } from '../../config/logger.js'

/**
 * Instagram — imagem de um post público, SEM a API da Meta (que exige app
 * aprovado, token de longa duração renovado a cada 60 dias e conta Business).
 *
 * Lê as meta tags Open Graph da página do post, as mesmas que o WhatsApp usa
 * para montar a prévia de um link. O Instagram só as entrega a crawlers
 * conhecidos — para um navegador comum ele responde a casca da SPA, sem imagem.
 * Por isso o User-Agent de crawler.
 *
 * É scraping e pode quebrar (IP bloqueado, HTML mudou): toda falha vira
 * INSTAGRAM_POST_UNAVAILABLE, que o admin trata oferecendo o envio manual.
 */

const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'

export type InstagramPostImage = {
  body: Buffer
  mimeType: (typeof ALLOWED_IMAGE_TYPES)[number]
  caption: string | null
  /** De onde veio a foto: o `/embed/` entrega o quadro inteiro, a og:image é o recorte. */
  source: 'embed' | 'og'
}

const unavailable = (reason: string, extra?: Record<string, unknown>) => {
  logger.warn({ reason, ...extra }, 'Instagram não entregou a imagem do post')
  return appError(
    ERROR_CODES.INSTAGRAM_POST_UNAVAILABLE,
    'Não foi possível carregar a imagem deste post. Envie a imagem manualmente.',
    422,
  )
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** A ordem dos atributos na tag não é garantida: aceita as duas. */
const metaContent = (html: string, property: string): string | null => {
  const p = property.replace(/[.:]/g, '\\$&')
  const re = new RegExp(
    `<meta[^>]+(?:property|name)="${p}"[^>]*content="([^"]*)"|<meta[^>]+content="([^"]*)"[^>]*(?:property|name)="${p}"`,
    'i',
  )
  const m = re.exec(html)
  const value = m?.[1] ?? m?.[2]
  return value ? decodeEntities(value) : null
}

/** O teto do próprio Instagram para uma legenda. */
const MAX_CAPTION = 2200

/**
 * O og:title de um post vem como `Fulano no Instagram: "legenda…"`, com a
 * legenda INTEIRA e as quebras de linha. Só a legenda interessa: é o alt da
 * imagem e o texto expansível da loja. As quebras ficam — a loja as mostra.
 */
export const extractCaption = (html: string): string | null => {
  const title = metaContent(html, 'og:title')
  const quoted = title && /:\s*"([\s\S]+)"\s*$/.exec(title)?.[1]
  const caption = (quoted || title || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return caption ? caption.slice(0, MAX_CAPTION) : null
}

const fetchWithTimeout = async (url: string, init: RequestInit = {}): Promise<Response> => {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(10000) })
  } catch (err) {
    throw unavailable('rede', { url, err: (err as Error).message })
  }
}

export type InstagramPostMeta = { imageUrl: string; caption: string | null }

/** Só lê a página do post: a URL da imagem na CDN e a legenda. */
export const fetchPostMeta = async (permalink: string): Promise<InstagramPostMeta> => {
  const page = await fetchWithTimeout(permalink, {
    headers: { 'User-Agent': CRAWLER_UA, 'Accept-Language': 'pt-BR,pt;q=0.9' },
  })
  // Post privado ou IP marcado: o Instagram redireciona para o login em vez de 4xx.
  if (!page.ok || page.url.includes('/accounts/login')) {
    throw unavailable('página', { permalink, status: page.status, finalUrl: page.url })
  }

  const html = await page.text()
  const imageUrl = metaContent(html, 'og:image')
  if (!imageUrl) throw unavailable('sem og:image', { permalink })

  return { imageUrl, caption: extractCaption(html) }
}

/**
 * A foto do post no quadro inteiro, lida da página `/embed/` (o HTML que o
 * iframe oficial carrega). A og:image NÃO serve de foto: o Instagram a entrega
 * como o topo-centro com 60% da largura, ampliado para 640px
 * (`stp=c216.0.648.648a_…_s640x640`), e na loja ela parecia "com zoom".
 * O `srcset` traz o original (1080–1440px): fica o maior.
 */
export const extractEmbedImageUrl = (html: string): string | null => {
  const tag = /<img\b[^>]*\bclass="[^"]*\bEmbeddedMediaImage\b[^"]*"[^>]*>/i.exec(html)?.[0]
  if (!tag) return null
  const attr = (name: string) => {
    const value = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag)?.[1]
    return value ? decodeEntities(value) : null
  }

  const best = (attr('srcset') ?? '')
    .split(',')
    .map((candidate) => {
      const [url, width] = candidate.trim().split(/\s+/)
      return { url, width: Number.parseInt(width ?? '', 10) || 0 }
    })
    .filter((c): c is { url: string; width: number } => !!c.url)
    .sort((a, b) => b.width - a.width)[0]

  const url = best?.url ?? attr('src')
  return url && /^https:\/\//.test(url) ? url : null
}

const SHORTCODE_IN_PERMALINK = /\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/

/** Sem a página `/embed/` (bloqueio, HTML mudou), o post ainda entra com a og:image. */
const fetchEmbedImageUrl = async (permalink: string): Promise<string | null> => {
  const shortcode = SHORTCODE_IN_PERMALINK.exec(permalink)?.[1]
  if (!shortcode) return null
  try {
    const page = await fetchWithTimeout(`https://www.instagram.com/p/${shortcode}/embed/`, {
      headers: { 'User-Agent': CRAWLER_UA, 'Accept-Language': 'pt-BR,pt;q=0.9' },
    })
    if (!page.ok || page.url.includes('/accounts/login')) return null
    return extractEmbedImageUrl(await page.text())
  } catch {
    return null
  }
}

export const fetchPostImage = async (permalink: string): Promise<InstagramPostImage> => {
  const [meta, embedImageUrl] = await Promise.all([fetchPostMeta(permalink), fetchEmbedImageUrl(permalink)])
  const { caption } = meta
  const source = embedImageUrl ? 'embed' : 'og'
  if (!embedImageUrl) {
    logger.warn({ permalink }, 'Instagram sem foto no /embed/: usando a og:image, que vem recortada')
  }
  const imageUrl = embedImageUrl ?? meta.imageUrl

  const image = await fetchWithTimeout(imageUrl)
  if (!image.ok) throw unavailable('imagem', { permalink, status: image.status })

  const mimeType = (image.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
    throw unavailable('tipo', { permalink, mimeType })
  }

  const declared = Number(image.headers.get('content-length') ?? 0)
  if (declared > MAX_UPLOAD_BYTES) throw unavailable('tamanho', { permalink, declared })

  const body = Buffer.from(await image.arrayBuffer())
  if (body.length === 0 || body.length > MAX_UPLOAD_BYTES) {
    throw unavailable('tamanho', { permalink, size: body.length })
  }

  return {
    body,
    mimeType: mimeType as InstagramPostImage['mimeType'],
    caption,
    source,
  }
}
