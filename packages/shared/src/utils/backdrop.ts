import {
  contrastRatio,
  hexToOklch,
  linearRgbToOklch,
  oklchToCss,
  oklchToHex,
  readableInk,
  srgbByteToLinear,
  MIN_CONTRAST,
  type Oklch,
} from './color.js'

/**
 * O fundo do banner que prolonga a borda da foto — funções PURAS.
 *
 * A foto do slide fica presa à direita (desktop) ou em cima (celular), e o resto
 * do slide é pintado com a cor da borda dela. Quem amostra é o admin, no
 * navegador, uma vez por upload; a loja só lê as faixas gravadas no banner. Por
 * isso a amostragem recebe pixels crus (canvas no admin, sharp num script) e não
 * sabe de onde eles vieram.
 *
 * Loja e prévia do admin pintam com `deriveBannerVars` — a mesma função dos dois
 * lados, pelo mesmo motivo do `deriveThemeVars`: se a prévia mente, o lojista
 * configura no escuro.
 */

/** RGBA em linhas, 4 bytes por pixel — o formato do `ImageData` e do sharp `raw`. */
export type PixelGrid = {
  data: ArrayLike<number>
  width: number
  height: number
}

export type SampledBackdrop = {
  /** Borda esquerda, de cima para baixo. */
  left: string[]
  /** Borda de baixo, da esquerda para a direita. */
  bottom: string[]
  /**
   * Borda com textura demais: o prolongamento vai parecer borrão. Por borda,
   * porque cada uma só aparece num tamanho de tela — a esquerda no computador,
   * a de baixo no celular — e o aviso precisa dizer onde.
   */
  busy: { left: boolean; bottom: boolean }
}

/** Faixas por borda. Mais que isso o degradê só reproduz ruído do JPEG. */
const BANDS = 6

/** Espessura da faixa amostrada, em fração do lado. ~5px numa foto de 256. */
const STRIP = 0.02

/**
 * Desvio de luminosidade (L do OKLab) dentro de uma faixa a partir do qual a
 * borda é "carregada". Medido com as fotos da loja (24/10/2026): fundo de
 * estúdio e parede ficam entre 0.006 e 0.02; pote cortado na borda, 0.15;
 * bandeja ou planta cortada pela borda de baixo, ~0.07.
 */
const BUSY_DEVIATION = 0.05

/** Abaixo disto a faixa é transparente demais para ter cor (PNG recortado). */
const MIN_ALPHA_WEIGHT = 0.5

type Rect = { x0: number; y0: number; x1: number; y1: number }

type StripResult = { colors: string[]; deviation: number }

/**
 * Média de uma faixa da borda, dividida em BANDS bandas ao longo dela.
 *
 * A média é no RGB LINEAR: no sRGB a média de preto e branco dá um cinza escuro
 * demais, e a emenda com a foto apareceria. Ponderada pelo alfa, para o pixel
 * transparente de um PNG não puxar a cor para o preto.
 */
const sampleStrip = (grid: PixelGrid, rect: Rect, axis: 'vertical' | 'horizontal'): StripResult | null => {
  const { data, width } = grid
  const span = axis === 'vertical' ? rect.y1 - rect.y0 : rect.x1 - rect.x0
  // Borda com menos pixels que bandas: uma banda por pixel, sem repetir.
  const bands = Math.min(BANDS, span)
  const colors: string[] = []
  let deviationSum = 0
  let deviationCount = 0

  for (let band = 0; band < bands; band++) {
    const from = Math.floor((band * span) / bands)
    const to = Math.floor(((band + 1) * span) / bands)
    const area: Rect =
      axis === 'vertical'
        ? { x0: rect.x0, x1: rect.x1, y0: rect.y0 + from, y1: rect.y0 + to }
        : { x0: rect.x0 + from, x1: rect.x0 + to, y0: rect.y0, y1: rect.y1 }

    let weight = 0
    let r = 0
    let g = 0
    let b = 0
    let lightSum = 0
    let lightSquares = 0

    for (let y = area.y0; y < area.y1; y++) {
      for (let x = area.x0; x < area.x1; x++) {
        const i = (y * width + x) * 4
        const alpha = (data[i + 3] ?? 255) / 255
        if (alpha === 0) continue
        const lr = srgbByteToLinear(data[i] ?? 0)
        const lg = srgbByteToLinear(data[i + 1] ?? 0)
        const lb = srgbByteToLinear(data[i + 2] ?? 0)
        const light = linearRgbToOklch(lr, lg, lb).l
        weight += alpha
        r += lr * alpha
        g += lg * alpha
        b += lb * alpha
        lightSum += light * alpha
        lightSquares += light * light * alpha
      }
    }

    // Banda transparente fica de fora; o degradê liga as vizinhas.
    if (weight < MIN_ALPHA_WEIGHT) continue

    colors.push(oklchToHex(linearRgbToOklch(r / weight, g / weight, b / weight)))
    const mean = lightSum / weight
    deviationSum += Math.sqrt(Math.max(0, lightSquares / weight - mean * mean))
    deviationCount++
  }

  if (colors.length === 0) return null
  return { colors, deviation: deviationSum / deviationCount }
}

/**
 * As faixas da borda esquerda e da de baixo de uma foto. `null` quando uma das
 * bordas é toda transparente — aí não há cor para prolongar, e a loja cai no
 * fundo do tema.
 */
export const sampleBackdrop = (grid: PixelGrid): SampledBackdrop | null => {
  const { width, height } = grid
  if (width < 1 || height < 1) return null

  const columns = Math.max(1, Math.round(width * STRIP))
  const rows = Math.max(1, Math.round(height * STRIP))

  const left = sampleStrip(grid, { x0: 0, x1: columns, y0: 0, y1: height }, 'vertical')
  const bottom = sampleStrip(grid, { x0: 0, x1: width, y0: height - rows, y1: height }, 'horizontal')
  if (!left || !bottom) return null

  return {
    left: left.colors,
    bottom: bottom.colors,
    busy: { left: left.deviation > BUSY_DEVIATION, bottom: bottom.deviation > BUSY_DEVIATION },
  }
}

/**
 * O degradê CSS das faixas. Cada cor vai no CENTRO da sua banda (a primeira em
 * ~8%, não em 0%): é onde ela foi medida, e assim a ponta do slide repete a
 * ponta da foto em vez de esticar a média até a quina.
 */
export const backdropGradient = (stops: string[], direction: 'to bottom' | 'to right'): string => {
  // linear-gradient com uma cor só é CSS inválido — repete a cor.
  if (stops.length === 1) return `linear-gradient(${stops[0]}, ${stops[0]})`
  const positioned = stops.map((color, i) => `${color} ${Math.round(((i + 0.5) / stops.length) * 1000) / 10}%`)
  return `linear-gradient(${direction}, ${positioned.join(', ')})`
}

/**
 * A cor do texto que lê sobre TODAS as faixas debaixo dele. O mesmo motor do
 * `contrastForeground` (escuro 0.22 ou claro 0.99, o que bastar), só que medido
 * no pior caso de várias superfícies: num degradê de parede clara para mesa
 * escura, o texto passa pelas duas.
 */
export const backdropInk = (stops: string[]): Oklch => {
  const surfaces = stops.map(hexToOklch)
  // O matiz vem da faixa do meio, com croma baixo — mesmo racional do
  // contrastForeground: texto quente sobre fundo quente, não cinza morto.
  const tint = surfaces[Math.floor(surfaces.length / 2)] ?? { l: 1, c: 0, h: 0 }
  const dark = { l: 0.22, c: Math.min(tint.c, 0.02), h: tint.h }
  const light = { l: 0.99, c: Math.min(tint.c, 0.01), h: tint.h }

  const worst = (ink: Oklch): number => Math.min(...surfaces.map((s) => contrastRatio(ink, s)))
  const darkRatio = worst(dark)
  const lightRatio = worst(light)

  if (darkRatio >= MIN_CONTRAST && darkRatio >= lightRatio) return dark
  if (lightRatio >= MIN_CONTRAST) return light
  return readableInk(darkRatio >= lightRatio ? dark : light, surfaces)
}

/**
 * As faixas que ficam DEBAIXO do texto no desktop: o texto é centralizado na
 * vertical, então as pontas de cima e de baixo não o tocam. Com poucas faixas
 * (cor própria = 1), todas valem.
 */
const textStops = (stops: string[]): string[] => (stops.length >= 4 ? stops.slice(1, -1) : stops)

/**
 * As variáveis CSS do slide: fundo e tinta do celular (`--hero-*`) e do desktop
 * (`--hero-*-md`). Loja e prévia do admin usam esta mesma função.
 */
export const deriveBannerVars = (backdrop: { left: string[]; bottom: string[] }): Record<string, string> => ({
  '--hero-bg': backdropGradient(backdrop.bottom, 'to right'),
  '--hero-ink': oklchToCss(backdropInk(backdrop.bottom)),
  '--hero-bg-md': backdropGradient(backdrop.left, 'to bottom'),
  '--hero-ink-md': oklchToCss(backdropInk(textStops(backdrop.left))),
})
