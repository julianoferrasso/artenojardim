import { describe, it, expect } from 'vitest'
import { parseInstagramPostUrl, createInstagramPostSchema } from '@ecommerce/shared/contracts'

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

describe('createInstagramPostSchema', () => {
  it('aceita link de post', () => {
    expect(createInstagramPostSchema.safeParse({ url: 'https://instagram.com/p/C8xYz12AbCd' }).success).toBe(true)
  })

  it('recusa link de perfil', () => {
    expect(createInstagramPostSchema.safeParse({ url: 'https://instagram.com/arte_no_jardim' }).success).toBe(false)
  })
})
