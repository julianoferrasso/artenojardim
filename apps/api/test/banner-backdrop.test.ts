import { describe, it, expect } from 'vitest'
import {
  backdropGradient,
  backdropInk,
  bannerTextContrast,
  contrastRatio,
  deriveBannerVars,
  hexToOklch,
  sampleBackdrop,
  softenStops,
  MIN_CONTRAST,
  type BannerLook,
  type PixelGrid,
} from '@ecommerce/shared/utils'
import { createBannerSchema, updateBannerSchema } from '@ecommerce/shared/contracts'

/**
 * O fundo do banner prolonga a borda da foto. Se a amostragem errar, a emenda
 * entre foto e fundo aparece; se a tinta errar, o título some sobre o fundo.
 */

type Rgba = [number, number, number, number]

/** Grade sintética: cada pixel decidido por (x, y). */
const grid = (width: number, height: number, pixel: (x: number, y: number) => Rgba): PixelGrid => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data.set(pixel(x, y), (y * width + x) * 4)
    }
  }
  return { data, width, height }
}

/** Gerador determinístico — ruído reproduzível de um teste para o outro. */
const noise = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}

describe('sampleBackdrop', () => {
  it('foto de fundo liso: faixas iguais e borda não carregada', () => {
    const result = sampleBackdrop(grid(256, 256, () => [232, 220, 205, 255]))

    expect(result).not.toBeNull()
    expect(new Set(result!.left)).toEqual(new Set(['#e8dccd']))
    expect(new Set(result!.bottom)).toEqual(new Set(['#e8dccd']))
    expect(result!.left).toHaveLength(6)
    expect(result!.busy).toEqual({ left: false, bottom: false })
  })

  it('ruído de JPEG não conta como borda carregada', () => {
    const rand = noise(7)
    const jitter = () => Math.round((rand() - 0.5) * 6)
    const result = sampleBackdrop(grid(256, 256, () => [232 + jitter(), 220 + jitter(), 205 + jitter(), 255]))

    expect(result!.busy).toEqual({ left: false, bottom: false })
  })

  it('parede clara em cima e mesa escura embaixo: a borda esquerda vai do claro ao escuro', () => {
    const result = sampleBackdrop(
      grid(256, 256, (_, y) => (y < 128 ? [240, 236, 230, 255] : [70, 45, 30, 255])),
    )

    const lightness = result!.left.map((hex) => hexToOklch(hex).l)
    expect(lightness[0]).toBeGreaterThan(0.9)
    expect(lightness[5]).toBeLessThan(0.4)
    // Uma banda inteira de cada lado da linha — o degradê não inventa o meio.
    expect(result!.left[0]).toBe(result!.left[2])
    expect(result!.left[3]).toBe(result!.left[5])
  })

  it('a borda de baixo é lida da esquerda para a direita', () => {
    const result = sampleBackdrop(grid(256, 256, (x) => (x < 128 ? [250, 250, 250, 255] : [20, 20, 20, 255])))

    expect(hexToOklch(result!.bottom[0]!).l).toBeGreaterThan(0.9)
    expect(hexToOklch(result!.bottom[5]!).l).toBeLessThan(0.3)
  })

  it('a média é no RGB linear: xadrez preto e branco não dá cinza escuro', () => {
    const result = sampleBackdrop(
      grid(256, 256, (x, y) => ((x + y) % 2 === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255])),
    )
    // Média sRGB daria #808080 (L ≈ 0.6); a linear dá #bcbcbc (L ≈ 0.8).
    expect(hexToOklch(result!.left[0]!).l).toBeGreaterThan(0.75)
  })

  it('pixel transparente não puxa a cor para o preto', () => {
    // Metade de cada faixa transparente (RGB zerado, como o canvas devolve).
    const result = sampleBackdrop(
      grid(256, 256, (x, y) => ((x + y) % 2 === 0 ? [0, 0, 0, 0] : [200, 120, 90, 255])),
    )
    expect(result!.left[0]).toBe('#c8785a')
  })

  it('borda toda transparente (PNG recortado): sem fundo', () => {
    expect(sampleBackdrop(grid(64, 64, () => [255, 255, 255, 0]))).toBeNull()
  })

  it('borda com objeto cortado (textura forte) é carregada', () => {
    const rand = noise(42)
    const result = sampleBackdrop(
      grid(256, 256, () => {
        const v = Math.round(rand() * 255)
        return [v, v, v, 255]
      }),
    )
    expect(result!.busy).toEqual({ left: true, bottom: true })
  })

  it('diz QUAL borda é carregada: só a de baixo (celular) não acusa a esquerda', () => {
    const rand = noise(9)
    // Parede lisa, com textura só nas últimas linhas (bandeja cortada pela borda).
    const result = sampleBackdrop(
      grid(256, 256, (x, y) => {
        if (y < 250 || x < 128) return [228, 216, 200, 255]
        const v = Math.round(rand() * 255)
        return [v, v, v, 255]
      }),
    )
    expect(result!.busy).toEqual({ left: false, bottom: true })
  })

  it('region lê a metade esquerda da foto, não só a borda', () => {
    // Borda esquerda clara (10% da largura), o resto escuro: a borda é clara,
    // mas a região do texto (45%) puxa para o escuro.
    const result = sampleBackdrop(grid(200, 120, (x) => (x < 20 ? [245, 240, 232, 255] : [40, 30, 25, 255])))
    expect(hexToOklch(result!.left[0]!).l).toBeGreaterThan(0.9)
    expect(hexToOklch(result!.region[0]!).l).toBeLessThan(hexToOklch(result!.left[0]!).l - 0.2)
  })

  it('foto minúscula (1×1) ainda devolve uma cor por borda', () => {
    const result = sampleBackdrop(grid(1, 1, () => [10, 20, 30, 255]))
    expect(result!.left).toEqual(['#0a141e'])
    expect(result!.bottom).toEqual(['#0a141e'])
  })
})

describe('backdropGradient', () => {
  it('uma cor só vira um degradê válido (CSS não aceita linear-gradient com 1 cor)', () => {
    expect(backdropGradient(['#abcdef'], 'to bottom')).toBe('linear-gradient(#abcdef, #abcdef)')
  })

  it('cada cor vai no centro da sua banda', () => {
    expect(backdropGradient(['#000000', '#ffffff'], 'to right')).toBe(
      'linear-gradient(to right, #000000 25%, #ffffff 75%)',
    )
  })
})

describe('backdropInk', () => {
  const worst = (stops: string[]) => {
    const ink = backdropInk(stops)
    return Math.min(...stops.map((s) => contrastRatio(ink, hexToOklch(s))))
  }

  it('fundo claro pede tinta escura', () => {
    expect(backdropInk(['#f4ece4']).l).toBeLessThan(0.5)
    expect(worst(['#f4ece4'])).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  it('fundo escuro pede tinta clara', () => {
    expect(backdropInk(['#2a1d16']).l).toBeGreaterThan(0.5)
    expect(worst(['#2a1d16'])).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })

  it('degradê lê no pior caso, não na média', () => {
    const stops = ['#f5f0ea', '#e6dccf', '#c9b8a3', '#b49c82']
    expect(worst(stops)).toBeGreaterThanOrEqual(MIN_CONTRAST)
  })
})

/** As faixas reais do banner do print da cliente (24/10/2026): vaso vermelho na borda. */
const PRINT_LEFT = ['#968270', '#8c1e07', '#691204', '#5b3823', '#492b18', '#563411']
const PRINT_BOTTOM = ['#56340f', '#5a3713', '#553311', '#553413', '#5d3b18', '#603d1a']

const look = (overrides: Partial<BannerLook> = {}): BannerLook => ({
  layout: 'SIDE',
  blur: true,
  backdrop: { source: 'image', left: PRINT_LEFT, bottom: PRINT_BOTTOM },
  ...overrides,
})

describe('softenStops', () => {
  const chroma = (hex: string) => hexToOklch(hex).c
  const spread = (stops: string[]) => {
    const ls = stops.map((hex) => hexToOklch(hex).l)
    return Math.max(...ls) - Math.min(...ls)
  }

  it('tira intensidade: o vermelho vivo da borda perde croma', () => {
    const soft = softenStops(PRINT_LEFT)
    expect(chroma(soft[1]!)).toBeLessThan(chroma(PRINT_LEFT[1]!) * 0.7)
  })

  it('aproxima as faixas entre si (menos bandeado)', () => {
    expect(spread(softenStops(PRINT_LEFT))).toBeLessThan(spread(PRINT_LEFT) * 0.6)
  })

  it('cor única continua cor única', () => {
    const [soft] = softenStops(['#c08a8a'])
    expect(hexToOklch(soft!).l).toBeCloseTo(hexToOklch('#c08a8a').l, 2)
  })
})

describe('deriveBannerVars', () => {
  it('o desktop mede a tinta só nas faixas do meio, onde o texto fica', () => {
    // Pontas escuras, meio claro: a tinta do desktop é escura (lê no meio).
    const vars = deriveBannerVars(
      look({
        backdrop: {
          source: 'custom',
          left: ['#101010', '#f2f2f2', '#f2f2f2', '#f2f2f2', '#f2f2f2', '#101010'],
          bottom: ['#f2f2f2'],
        },
      }),
    )
    expect(vars['--hero-ink-md']).toMatch(/^oklch\(0\.22 /)
    expect(vars['--hero-bg']).toBe('linear-gradient(#f2f2f2, #f2f2f2)')
    expect(vars['--hero-bg-md']).toMatch(/^linear-gradient\(to bottom, #101010 8\.3%/)
  })

  it('cor própria não é suavizada; cores da foto são', () => {
    const custom = deriveBannerVars(look({ backdrop: { source: 'custom', left: ['#8c1e07'], bottom: ['#8c1e07'] } }))
    expect(custom['--hero-bg-md']).toBe('linear-gradient(#8c1e07, #8c1e07)')
    const image = deriveBannerVars(look())
    expect(image['--hero-bg-md']).not.toContain('#8c1e07')
  })

  it('à direita sem desfoque: nenhuma variável — o texto fica na secundária do tema', () => {
    expect(deriveBannerVars(look({ blur: false }))).toEqual({})
  })

  it('foto de fundo com desfoque: véu com opacidade e tinta, sem fundo prolongado no desktop', () => {
    const vars = deriveBannerVars(look({ layout: 'COVER' }))
    expect(vars['--hero-tint']).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+ \/ 0\.45\)$/)
    expect(vars['--hero-ink-md']).toBeDefined()
    expect(vars['--hero-bg-md']).toBeUndefined()
    expect(vars['--hero-bg']).toBeDefined()
  })

  it('foto de fundo com cor própria: o véu é a cor própria, a tinta mede a foto com o véu', () => {
    const vars = deriveBannerVars(
      look({
        layout: 'COVER',
        backdrop: { source: 'custom', left: ['#ffffff'], bottom: ['#ffffff'], region: ['#101010', '#101010'] },
      }),
    )
    expect(vars['--hero-tint']).toMatch(/^oklch\(1\.000 0\.000 [\d.]+ \/ 0\.45\)$/)
    // Foto preta + véu branco a 45%: fundo médio-escuro, a tinta clara lê melhor.
    expect(hexToOklch('#101010').l).toBeLessThan(0.2)
    expect(vars['--hero-ink-md']).toMatch(/^oklch\(0\.99 |^oklch\(1 /)
  })

  it('foto de fundo sem desfoque: só a tinta do desktop, sem véu', () => {
    const vars = deriveBannerVars(look({ layout: 'COVER', blur: false }))
    expect(Object.keys(vars)).toEqual(['--hero-ink-md'])
  })

  it('foto de fundo sem region (banner antigo) cai na borda esquerda', () => {
    const withRegion = deriveBannerVars(
      look({ layout: 'COVER', blur: false, backdrop: { source: 'image', left: PRINT_LEFT, bottom: PRINT_BOTTOM, region: PRINT_LEFT } }),
    )
    expect(deriveBannerVars(look({ layout: 'COVER', blur: false }))).toEqual(withRegion)
  })

  it('sem cor amostrada: nada a derivar', () => {
    expect(deriveBannerVars(look({ backdrop: null }))).toEqual({})
  })
})

describe('bannerTextContrast', () => {
  it('com desfoque, o texto do print lê (≥ 4.5) no desktop e no celular', () => {
    for (const layout of ['SIDE', 'COVER'] as const) {
      const contrast = bannerTextContrast(look({ layout }))
      expect(contrast.desktop).toBeGreaterThanOrEqual(MIN_CONTRAST)
      expect(contrast.mobile).toBeGreaterThanOrEqual(MIN_CONTRAST)
    }
  })

  it('na secundária do tema não há o que medir', () => {
    expect(bannerTextContrast(look({ blur: false }))).toEqual({ mobile: null, desktop: null })
  })

  it('foto de fundo sem desfoque sobre região clara e escura: contraste baixo (o admin avisa)', () => {
    const contrast = bannerTextContrast(
      look({
        layout: 'COVER',
        blur: false,
        backdrop: { source: 'image', left: ['#ffffff'], bottom: ['#ffffff'], region: ['#f5f5f5', '#f5f5f5', '#202020', '#f5f5f5', '#202020', '#f5f5f5'] },
      }),
    )
    expect(contrast.desktop).toBeLessThan(MIN_CONTRAST)
  })
})

describe('contrato do backdrop', () => {
  const base = { title: 'Velas' }
  const backdrop = { source: 'image', left: ['#ffffff'], bottom: ['#000000'] }

  it('aceita faixas em hex', () => {
    expect(createBannerSchema.safeParse({ ...base, backdrop }).success).toBe(true)
  })

  it('recusa cor fora do formato, lista vazia e faixas demais', () => {
    expect(createBannerSchema.safeParse({ ...base, backdrop: { ...backdrop, left: ['red'] } }).success).toBe(false)
    expect(createBannerSchema.safeParse({ ...base, backdrop: { ...backdrop, bottom: [] } }).success).toBe(false)
    expect(
      createBannerSchema.safeParse({ ...base, backdrop: { ...backdrop, left: Array(9).fill('#ffffff') } }).success,
    ).toBe(false)
  })

  it('o update parcial não injeta backdrop, layout nem desfoque (sobrescreveria o salvo)', () => {
    const parsed = updateBannerSchema.parse({ title: 'Outro' })
    expect('backdrop' in parsed).toBe(false)
    expect('layout' in parsed).toBe(false)
    expect('blurBehindText' in parsed).toBe(false)
  })

  it('aceita a posição e o desfoque; recusa posição desconhecida', () => {
    expect(createBannerSchema.safeParse({ ...base, layout: 'COVER', blurBehindText: false }).success).toBe(true)
    expect(createBannerSchema.safeParse({ ...base, layout: 'TOP' }).success).toBe(false)
  })

  it('region é opcional (banners gravados antes dela)', () => {
    expect(createBannerSchema.safeParse({ ...base, backdrop: { ...backdrop, region: ['#123456'] } }).success).toBe(true)
  })
})
