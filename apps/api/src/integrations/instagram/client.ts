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

/**
 * O og:title de um post vem como `Fulano on Instagram: "legenda…"`. Só a
 * legenda interessa — é o alt da imagem na loja.
 */
const extractCaption = (html: string): string | null => {
  const title = metaContent(html, 'og:title')
  const quoted = title && /:\s*"([\s\S]+)"\s*$/.exec(title)?.[1]
  const caption = (quoted || title || '').replace(/\s+/g, ' ').trim()
  return caption ? caption.slice(0, 300) : null
}

const fetchWithTimeout = async (url: string, init: RequestInit = {}): Promise<Response> => {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(10000) })
  } catch (err) {
    throw unavailable('rede', { url, err: (err as Error).message })
  }
}

export const fetchPostImage = async (permalink: string): Promise<InstagramPostImage> => {
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
    caption: extractCaption(html),
  }
}
