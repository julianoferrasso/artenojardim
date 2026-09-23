import { describe, it, expect, vi } from 'vitest'
import { extractCaption } from '../src/integrations/instagram/client.js'

// O client importa o logger, que valida o ambiente inteiro no import.
vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}))

/**
 * A legenda vira texto expansível na loja: se a extração achatar as quebras de
 * linha ou cortar no meio, o "ver mais" abre um parágrafo corrido e incompleto.
 */

const page = (title: string) =>
  `<html><head><meta property="og:title" content="${title}" /><meta property="og:image" content="x" /></head></html>`

describe('extractCaption', () => {
  it('pega só a legenda entre aspas e preserva as quebras de linha', () => {
    const title =
      'Arte no Jardim | Presentes Afetivos no Instagram: &quot;Uma lembrancinha 🕯️&#10;Para quem ilumina&#10;&#10;#velas #amor&quot;'
    expect(extractCaption(page(title))).toBe('Uma lembrancinha 🕯️\nPara quem ilumina\n\n#velas #amor')
  })

  it('aceita quebras literais e normaliza espaços, CRLF e excesso de linhas em branco', () => {
    const title = 'Loja no Instagram: "Linha   um  \r\n\r\n\r\n\r\n   Linha\tdois"'.replace(/"/g, '&quot;')
    expect(extractCaption(page(title))).toBe('Linha um\n\nLinha dois')
  })

  it('sem aspas, usa o título inteiro', () => {
    expect(extractCaption(page('Arte no Jardim'))).toBe('Arte no Jardim')
  })

  it('não corta legenda longa antes do teto do Instagram (2200)', () => {
    const long = 'a'.repeat(1500)
    expect(extractCaption(page(`X no Instagram: &quot;${long}&quot;`))).toHaveLength(1500)
    expect(extractCaption(page(`X no Instagram: &quot;${'b'.repeat(3000)}&quot;`))).toHaveLength(2200)
  })

  it('sem og:title → null', () => {
    expect(extractCaption('<html></html>')).toBeNull()
  })
})
