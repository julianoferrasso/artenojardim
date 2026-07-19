import { describe, it, expect } from 'vitest'
import { slugify, uniqueSlug } from '../src/utils/slug.js'

describe('slugify', () => {
  it.each([
    ['Cerâmica', 'ceramica'],
    ['Cerâmica Artesanal', 'ceramica-artesanal'],
    ['Óleo Essência', 'oleo-essencia'],
    ['Ação Promocional', 'acao-promocional'],
    ['São Paulo', 'sao-paulo'],
    ['Vasos & Plantas', 'vasos-plantas'],
    ['  Espaços   duplos  ', 'espacos-duplos'],
    ['JÁ-com-Hífen', 'ja-com-hifen'],
    ['Coração à Mão', 'coracao-a-mao'],
  ])('%s -> %s', (input, expected) => {
    // O acento tem que virar a letra base, não sumir: "cerâmica" é "ceramica",
    // nunca "cermica" nem "cer-mica" — o bug que a property escape corrigiu.
    expect(slugify(input)).toBe(expected)
  })

  it('trunca em 160 caracteres', () => {
    expect(slugify('a'.repeat(300)).length).toBe(160)
  })

  it('string só de símbolos vira vazio', () => {
    expect(slugify('!@#$%')).toBe('')
  })
})

describe('uniqueSlug', () => {
  it('devolve o base quando livre', () => {
    expect(uniqueSlug('vasos', new Set())).toBe('vasos')
  })

  it('sufixa -2 na primeira colisão', () => {
    expect(uniqueSlug('vasos', new Set(['vasos']))).toBe('vasos-2')
  })

  it('pula até o primeiro livre', () => {
    expect(uniqueSlug('vasos', new Set(['vasos', 'vasos-2', 'vasos-3']))).toBe('vasos-4')
  })
})
