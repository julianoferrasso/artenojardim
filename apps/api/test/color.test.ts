import { describe, it, expect } from 'vitest'
import {
  hexToOklch,
  oklchToHex,
  oklchToCss,
  contrastForeground,
  shiftLightness,
} from '@ecommerce/shared/utils'

/**
 * A conversão de cor é o que sustenta a tela de Aparência: o lojista escolhe em
 * hex, o banco guarda OKLCH e o CSS lê OKLCH. Um erro de matriz aqui não quebra
 * nada alto — só deixa a loja com a cor errada, que é o pior modo de falha.
 */

describe('hexToOklch — âncoras conhecidas', () => {
  it('branco é L=1 sem croma', () => {
    const white = hexToOklch('#ffffff')
    expect(white.l).toBeCloseTo(1, 2)
    expect(white.c).toBeCloseTo(0, 2)
  })

  it('preto é L=0', () => {
    expect(hexToOklch('#000000').l).toBeCloseTo(0, 2)
  })

  it('cinza não tem matiz (evita hue aleatório em cor sem cor)', () => {
    expect(hexToOklch('#808080').h).toBe(0)
  })

  it('aceita sem "#" e em maiúsculas', () => {
    expect(hexToOklch('C47A5E')).toEqual(hexToOklch('#c47a5e'))
  })

  it('hex incompleto vira preto em vez de lançar (digitação em andamento)', () => {
    expect(hexToOklch('#c4')).toEqual({ l: 0, c: 0, h: 0 })
  })

  it('vermelho puro cai no matiz quente (~29°)', () => {
    const red = hexToOklch('#ff0000')
    expect(red.h).toBeGreaterThan(20)
    expect(red.h).toBeLessThan(40)
    expect(red.c).toBeGreaterThan(0.2)
  })
})

describe('round-trip hex → oklch → hex', () => {
  // Inclui o primary e o background reais da loja hoje.
  const samples = ['#ffffff', '#000000', '#c47a5e', '#2d6a3f', '#1e40af', '#faf7f2', '#808080']

  it.each(samples)('%s sobrevive à ida e volta', (hex) => {
    expect(oklchToHex(hexToOklch(hex))).toBe(hex)
  })

  /**
   * Cor saturada na BORDA do gamut sRGB (o azul do #ffd700 é exatamente 0) não
   * fecha o round-trip exato, e aumentar as casas decimais não resolve — a cor
   * real cai entre dois passos da grade de 0.001 do croma. Erra por 2/255 num
   * canal, invisível a olho nu.
   *
   * Guardar mais casas só encheria o JSON de ruído para não corrigir nada, então
   * o teste registra o limite conhecido em vez de fingir que ele não existe.
   */
  it('cor no limite do gamut fecha com erro de no máximo 2/255', () => {
    const back = oklchToHex(hexToOklch('#ffd700'))
    const blue = parseInt(back.slice(5, 7), 16)
    expect(back.slice(0, 5)).toBe('#ffd7')
    expect(blue).toBeLessThanOrEqual(2)
  })
})

describe('oklchToCss', () => {
  it('emite o mesmo formato literal do globals.css', () => {
    expect(oklchToCss({ l: 0.56, c: 0.11, h: 30 })).toBe('oklch(0.56 0.11 30)')
  })
})

describe('contrastForeground — a rede de segurança da legibilidade', () => {
  it('fundo claro recebe texto escuro', () => {
    // Amarelo claro: o caso que quebraria a loja se o lojista escolhesse branco.
    expect(contrastForeground(hexToOklch('#ffd700')).l).toBeLessThan(0.3)
  })

  it('fundo escuro recebe texto claro', () => {
    expect(contrastForeground(hexToOklch('#1e40af')).l).toBeGreaterThan(0.9)
  })

  it('herda o matiz do fundo em vez de cinza morto', () => {
    const background = hexToOklch('#c47a5e')
    expect(contrastForeground(background).h).toBe(background.h)
  })

  it('mantém o croma baixo para não competir com o fundo', () => {
    expect(contrastForeground(hexToOklch('#ff0000')).c).toBeLessThanOrEqual(0.02)
  })
})

describe('shiftLightness', () => {
  it('clareia preservando o matiz', () => {
    const shifted = shiftLightness({ l: 0.5, c: 0.1, h: 42 }, 0.1)
    expect(shifted.l).toBeCloseTo(0.6, 3)
    expect(shifted.h).toBe(42)
  })

  it('não passa de 1 nem cai abaixo de 0', () => {
    expect(shiftLightness({ l: 0.95, c: 0.1, h: 0 }, 0.2).l).toBe(1)
    expect(shiftLightness({ l: 0.05, c: 0.1, h: 0 }, -0.2).l).toBe(0)
  })

  it('multiplica o croma quando pedido (border tem mais cor que o fundo)', () => {
    expect(shiftLightness({ l: 0.9, c: 0.01, h: 55 }, 0, 2).c).toBeCloseTo(0.02, 3)
  })
})
