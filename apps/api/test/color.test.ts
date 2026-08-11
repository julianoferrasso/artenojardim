import { describe, it, expect } from 'vitest'
import {
  hexToOklch,
  oklchToHex,
  oklchToCss,
  contrastForeground,
  contrastRatio,
  deriveThemeVars,
  isDeadZone,
  readableInk,
  shiftLightness,
  MIN_CONTRAST,
  type Oklch,
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

describe('contrastRatio — âncoras conhecidas', () => {
  const WHITE = { l: 1, c: 0, h: 0 }
  const BLACK = { l: 0, c: 0, h: 0 }

  it('preto sobre branco é 21:1, o máximo do sRGB', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 0)
  })

  it('uma cor sobre ela mesma é 1:1', () => {
    expect(contrastRatio({ l: 0.6, c: 0.1, h: 200 }, { l: 0.6, c: 0.1, h: 200 })).toBeCloseTo(1, 2)
  })

  it('é simétrico — a ordem dos argumentos não importa', () => {
    const a = { l: 0.3, c: 0.08, h: 40 }
    const b = { l: 0.9, c: 0.02, h: 90 }
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 6)
  })
})

/**
 * O tema que o lojista configurou e que expôs o bug: fundo ESCURO com marca
 * clara. Os números "antes" foram medidos no navegador, em produção.
 */
const LOJISTA = {
  primary: { l: 0.76, c: 0.057, h: 326.1 },
  secondary: { l: 0.946, c: 0.016, h: 139.4 },
  accent: { l: 0.912, c: 0.035, h: 138.6 },
  background: { l: 0.73, c: 0.029, h: 338.8 },
}

const parseOklch = (css: string): Oklch => {
  const [l, c, h] = (css.match(/[\d.]+/g) ?? []).map(Number) as [number, number, number]
  return { l, c, h }
}

describe('readableInk — a marca legível como tinta', () => {
  it('resolve o caso real: ícone invisível (1.07:1) sobre a bolinha do selo', () => {
    const card = shiftLightness(LOJISTA.background, 0.012, 0.5)

    // O que estava no ar: a marca crua sobre o card, praticamente a mesma cor.
    expect(contrastRatio(LOJISTA.primary, card)).toBeLessThan(1.2)

    // O que passa a ser usado.
    expect(contrastRatio(readableInk(LOJISTA.primary, card), card)).toBeGreaterThanOrEqual(
      MIN_CONTRAST,
    )
  })

  it('preserva o matiz da marca — continua sendo a marca', () => {
    const surface = { l: 0.98, c: 0.01, h: 75 }
    expect(readableInk({ l: 0.8, c: 0.12, h: 326.1 }, surface).h).toBe(326.1)
  })

  it('clareia a tinta quando o fundo é escuro', () => {
    const dark = { l: 0.12, c: 0.02, h: 260 }
    expect(readableInk({ l: 0.2, c: 0.1, h: 260 }, dark).l).toBeGreaterThan(0.5)
  })

  it('cede croma quando a luminosidade sozinha não alcança o alvo', () => {
    // Amarelo saturado sobre branco: nenhum L com c=0.16 chega a 4.5:1.
    const white = { l: 1, c: 0, h: 0 }
    const ink = readableInk({ l: 0.9, c: 0.16, h: 95 }, white)
    expect(contrastRatio(ink, white)).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })
})

/**
 * A varredura é o coração do teste: o bug subiu porque só existia tema claro.
 * Um teste que checa apenas o default nunca o pegaria.
 */
describe('deriveThemeVars — contraste garantido em qualquer tema', () => {
  const LIGHTNESSES = [0.05, 0.15, 0.25, 0.35, 0.45, 0.65, 0.73, 0.8, 0.9, 0.985]
  const CHROMAS = [0, 0.05, 0.11, 0.2]
  const HUES = [0, 90, 180, 270, 326.1]

  const cases = LIGHTNESSES.flatMap((l) =>
    CHROMAS.flatMap((c) => HUES.map((h) => ({ l, c, h }))),
  )

  it.each(cases)('fundo l=$l c=$c h=$h: tinta e texto secundário legíveis', (bg) => {
    const vars = deriveThemeVars({
      primary: { l: 0.7, c: Math.min(bg.c + 0.05, 0.3), h: (bg.h + 20) % 360 },
      secondary: { l: 0.9, c: 0.02, h: bg.h },
      accent: { l: 0.85, c: 0.03, h: bg.h },
      background: { l: bg.l, c: bg.c, h: bg.h },
    })

    const ink = parseOklch(vars['--primary-ink']!)
    const mutedFg = parseOklch(vars['--muted-foreground']!)
    const surfaces = ['--card', '--background', '--muted'].map((k) => parseOklch(vars[k]!))

    for (const surface of surfaces) {
      expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
    expect(contrastRatio(mutedFg, parseOklch(vars['--muted']!))).toBeGreaterThanOrEqual(
      MIN_CONTRAST,
    )
  })

  it('o texto secundário do lojista sai de 1.00:1 (invisível) para legível', () => {
    const vars = deriveThemeVars(LOJISTA)
    const ratio = contrastRatio(
      parseOklch(vars['--muted-foreground']!),
      parseOklch(vars['--muted']!),
    )
    expect(ratio).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  it('o par marca-como-fundo continua garantido', () => {
    const vars = deriveThemeVars(LOJISTA)
    expect(
      contrastRatio(parseOklch(vars['--primary-foreground']!), parseOklch(vars['--primary']!)),
    ).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })
})

describe('contrastForeground — a faixa cega fechada', () => {
  // Entre 0.565 e 0.62 o limiar antigo (0.62) escolhia texto claro, que falhava.
  it.each([0.57, 0.59, 0.61])('fundo l=%s recebe texto legível', (l) => {
    const bg = { l, c: 0.03, h: 40 }
    expect(contrastRatio(contrastForeground(bg), bg)).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })
})

describe('isDeadZone — o limite que a fórmula não vence', () => {
  it('marca a faixa intermediária de fundo', () => {
    expect(isDeadZone(0.54)).toBe(true)
    expect(isDeadZone(0.985)).toBe(false)
    expect(isDeadZone(0.12)).toBe(false)
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
