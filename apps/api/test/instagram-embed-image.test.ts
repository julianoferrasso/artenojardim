import { describe, it, expect, vi } from 'vitest'
import { extractEmbedImageUrl } from '../src/integrations/instagram/client.js'

// O client importa o logger, que valida o ambiente inteiro no import.
vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}))

/**
 * A foto da vitrine sai do `srcset` da página `/embed/`. Errar o candidato
 * devolve a miniatura de 150px (borrada na loja) ou nada (cai na og:image,
 * que é o recorte "com zoom").
 */

const CDN = 'https://instagram.fsdu32-1.fna.fbcdn.net/v/t51/foto.jpg'

describe('extractEmbedImageUrl', () => {
  it('escolhe o maior candidato do srcset e decodifica as entidades', () => {
    const html =
      `<div><img class="EmbeddedMediaImage" alt="post" src="${CDN}?s=640" ` +
      `srcset="${CDN}?s=640&amp;oh=1 640w,${CDN}?s=1080&amp;oh=1 1080w,${CDN}?s=150&amp;oh=1 150w" /></div>`
    expect(extractEmbedImageUrl(html)).toBe(`${CDN}?s=1080&oh=1`)
  })

  it('não depende da ordem dos atributos', () => {
    const html = `<img srcset="${CDN}?a 320w, ${CDN}?b 1440w" alt="" class="EmbeddedMediaImage" src="${CDN}?c">`
    expect(extractEmbedImageUrl(html)).toBe(`${CDN}?b`)
  })

  it('sem srcset, usa o src', () => {
    expect(extractEmbedImageUrl(`<img class="EmbeddedMediaImage" src="${CDN}?x&amp;y=1">`)).toBe(`${CDN}?x&y=1`)
  })

  it('ignora as outras imagens da página (avatar, ícones)', () => {
    const html = `<img class="Avatar" src="${CDN}?avatar"><img class="EmbeddedMediaImage" src="${CDN}?post">`
    expect(extractEmbedImageUrl(html)).toBe(`${CDN}?post`)
  })

  it('devolve null sem a imagem do post ou com URL que não é https', () => {
    expect(extractEmbedImageUrl('<html><body>Login • Instagram</body></html>')).toBeNull()
    expect(extractEmbedImageUrl('<img class="EmbeddedMediaImage" src="javascript:alert(1)">')).toBeNull()
  })
})
