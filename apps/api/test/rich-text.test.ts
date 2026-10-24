import { describe, it, expect } from 'vitest'
import { sanitizeRichText } from '../src/utils/rich-text.js'

describe('sanitizeRichText', () => {
  it('mantém a formatação que o editor produz', () => {
    const html =
      '<h2>Aroma</h2><p><strong>Lavanda</strong> e <em>alecrim</em>, <u>100% vegetal</u>.</p>' +
      '<ul><li><p>200 g</p></li></ul><ol><li><p>Apare o pavio</p></li></ol>'
    expect(sanitizeRichText(html)).toBe(html)
  })

  it('remove script com o conteúdo e todo atributo', () => {
    expect(
      sanitizeRichText('<p onclick="alert(1)" style="color:red">oi</p><script>alert(1)</script>'),
    ).toBe('<p>oi</p>')
  })

  it('link e imagem perdem a tag; o texto do link fica', () => {
    expect(
      sanitizeRichText('<p><a href="javascript:alert(1)">clique</a><img src=x onerror=alert(1)></p>'),
    ).toBe('<p>clique</p>')
  })

  it('b e i viram strong e em', () => {
    expect(sanitizeRichText('<p><b>a</b><i>b</i></p>')).toBe('<p><strong>a</strong><em>b</em></p>')
  })

  it('parágrafo vazio sai das pontas e fica no meio', () => {
    expect(sanitizeRichText('<p></p><p>a</p><p></p><p>b</p><ul><li><p>c</p></li></ul><p></p><p><br></p>')).toBe(
      '<p>a</p><p></p><p>b</p><ul><li><p>c</p></li></ul>',
    )
  })

  it('título colado fora da lista vira só texto', () => {
    expect(sanitizeRichText('<h1>Vela</h1>')).toBe('Vela')
  })

  it.each(['', '<p></p>', '<p> </p>', '<p>&nbsp;</p>', '<p><br></p>', '<script>x</script>'])(
    '%j sem texto visível vira null',
    (html) => {
      expect(sanitizeRichText(html)).toBeNull()
    },
  )
})
