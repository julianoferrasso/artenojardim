import type { BannerLayout } from '../constants/enums.js'
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
  /** Metade esquerda da foto, de cima para baixo: onde o texto cai na foto de fundo. */
  region: string[]
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

/** Largura da região do texto na foto de fundo: o texto ocupa ~a metade esquerda. */
const REGION = 0.45

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
 * As faixas da borda esquerda, da de baixo e da metade esquerda de uma foto.
 * `null` quando uma das bordas é toda transparente — aí não há cor para
 * prolongar, e a loja cai no fundo do tema.
 */
export const sampleBackdrop = (grid: PixelGrid): SampledBackdrop | null => {
  const { width, height } = grid
  if (width < 1 || height < 1) return null

  const columns = Math.max(1, Math.round(width * STRIP))
  const rows = Math.max(1, Math.round(height * STRIP))

  const left = sampleStrip(grid, { x0: 0, x1: columns, y0: 0, y1: height }, 'vertical')
  const bottom = sampleStrip(grid, { x0: 0, x1: width, y0: height - rows, y1: height }, 'horizontal')
  if (!left || !bottom) return null
  // Contém a faixa da borda esquerda, então nunca é null quando `left` não é.
  const region = sampleStrip(grid, { x0: 0, x1: Math.max(1, Math.round(width * REGION)), y0: 0, y1: height }, 'vertical')

  return {
    left: left.colors,
    bottom: bottom.colors,
    region: region?.colors ?? left.colors,
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

/** O pior contraste da tinta derivada sobre as faixas. */
const worstContrast = (stops: string[]): number => {
  const ink = backdropInk(stops)
  return Math.min(...stops.map((s) => contrastRatio(ink, hexToOklch(s))))
}

/**
 * As faixas que ficam DEBAIXO do texto no desktop: o texto é centralizado na
 * vertical, então as pontas de cima e de baixo não o tocam. Com poucas faixas
 * (cor própria = 1), todas valem.
 */
const textStops = (stops: string[]): string[] => (stops.length >= 4 ? stops.slice(1, -1) : stops)

type Lab = { l: number; a: number; b: number }

const toLab = ({ l, c, h }: Oklch): Lab => ({
  l,
  a: c * Math.cos((h * Math.PI) / 180),
  b: c * Math.sin((h * Math.PI) / 180),
})

const fromLab = ({ l, a, b }: Lab): Oklch => ({
  l,
  c: Math.hypot(a, b),
  h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
})

const mixLab = (from: Lab, to: Lab, amount: number): Lab => ({
  l: from.l + (to.l - from.l) * amount,
  a: from.a + (to.a - from.a) * amount,
  b: from.b + (to.b - from.b) * amount,
})

const meanLab = (labs: Lab[]): Lab => ({
  l: labs.reduce((sum, x) => sum + x.l, 0) / labs.length,
  a: labs.reduce((sum, x) => sum + x.a, 0) / labs.length,
  b: labs.reduce((sum, x) => sum + x.b, 0) / labs.length,
})

/**
 * Quanto cada faixa vai em direção à média das faixas (0 = intacta, 1 = cor
 * única). Mata o bandeado: um vaso vermelho na borda virava uma faixa
 * vermelho-vivo entre marrons, atrás do título (print da cliente, 24/10/2026).
 */
const SOFT_TOWARD_MEAN = 0.5

/** Multiplicador do croma: cores menos intensas que a borda real da foto. */
const SOFT_CHROMA = 0.5

/**
 * Suaviza as faixas amostradas da foto: puxa cada uma para a média e tira
 * intensidade. Aplicada na hora de PINTAR, não na amostragem — o banco guarda a
 * borda fiel, e recalibrar aqui não exige reamostrar nem migrar nada.
 */
export const softenStops = (stops: string[]): string[] => {
  const labs = stops.map((hex) => toLab(hexToOklch(hex)))
  const mean = meanLab(labs)
  return labs.map((lab) => {
    const toward = fromLab(mixLab(lab, mean, SOFT_TOWARD_MEAN))
    return oklchToHex({ ...toward, c: toward.c * SOFT_CHROMA })
  })
}

/**
 * Opacidade do véu atrás do texto na foto de fundo com desfoque. Vai DENTRO da
 * cor (`--hero-tint`), não numa classe de opacidade: a tinta do texto é medida
 * com este mesmo número, e dois lugares para ele sairiam de sincronia.
 */
const TINT_OPACITY = 0.45

/** O que decide o visual do slide com foto. */
export type BannerLook = {
  layout: BannerLayout
  blur: boolean
  backdrop: { source: 'image' | 'custom'; left: string[]; bottom: string[]; region?: string[] } | null
}

type Resolved = {
  vars: Record<string, string>
  /** Faixas debaixo do texto; null = o texto está na cor secundária do tema. */
  surfaces: { mobile: string[] | null; desktop: string[] | null }
}

const resolveLook = ({ layout, blur, backdrop }: BannerLook): Resolved => {
  // Sem cor amostrada (leitura falhou, PNG transparente): nada a derivar, o
  // slide usa a secundária do tema.
  if (!backdrop) return { vars: {}, surfaces: { mobile: null, desktop: null } }

  // Cor própria nunca é suavizada: o lojista escolheu aquela cor exata.
  const soft = (stops: string[]): string[] => (backdrop.source === 'image' ? softenStops(stops) : stops)
  const vars: Record<string, string> = {}
  const surfaces: Resolved['surfaces'] = { mobile: null, desktop: null }

  if (blur) {
    const bottom = soft(backdrop.bottom)
    vars['--hero-bg'] = backdropGradient(bottom, 'to right')
    vars['--hero-ink'] = oklchToCss(backdropInk(bottom))
    surfaces.mobile = bottom
  }

  if (layout === 'SIDE' && blur) {
    const left = soft(backdrop.left)
    vars['--hero-bg-md'] = backdropGradient(left, 'to bottom')
    vars['--hero-ink-md'] = oklchToCss(backdropInk(textStops(left)))
    surfaces.desktop = textStops(left)
  }

  if (layout === 'COVER') {
    // `region` é sempre a FOTO (mesmo com cor própria): é o que fica debaixo do
    // texto. Banner gravado antes dela cai na borda esquerda.
    const region = backdrop.region ?? backdrop.left
    let underText = textStops(region)
    if (blur) {
      // O véu é a média suavizada da região, ou a cor própria; o que o olho vê
      // atrás do texto é a foto desfocada (≈ a média de cada faixa) com o véu
      // por cima.
      const tintLab =
        backdrop.source === 'custom'
          ? toLab(hexToOklch(backdrop.left[0] ?? '#ffffff'))
          : meanLab(softenStops(region).map((hex) => toLab(hexToOklch(hex))))
      const tint = fromLab(tintLab)
      vars['--hero-tint'] = `oklch(${tint.l.toFixed(3)} ${tint.c.toFixed(3)} ${tint.h.toFixed(1)} / ${TINT_OPACITY})`
      underText = underText.map((hex) => oklchToHex(fromLab(mixLab(toLab(hexToOklch(hex)), tintLab, TINT_OPACITY))))
    }
    vars['--hero-ink-md'] = oklchToCss(backdropInk(underText))
    surfaces.desktop = underText
  }

  return { vars, surfaces }
}

/**
 * As variáveis CSS do slide com foto, por modo:
 * - `--hero-bg`/`--hero-ink`: celular com desfoque (borda de baixo prolongada);
 * - `--hero-bg-md`/`--hero-ink-md`: desktop com a foto à direita e desfoque;
 * - `--hero-tint`/`--hero-ink-md`: desktop com a foto de fundo (véu só com desfoque).
 * Chave ausente = o slide usa a secundária do tema ali. Loja e prévia do admin
 * usam esta mesma função.
 */
export const deriveBannerVars = (look: BannerLook): Record<string, string> => resolveLook(look).vars

/**
 * O pior contraste do texto em cada tamanho de tela, ou null onde o texto fica
 * na secundária do tema (contraste garantido pelo tema). O admin avisa abaixo de
 * MIN_CONTRAST — o caso típico é a foto de fundo sem desfoque.
 */
export const bannerTextContrast = (look: BannerLook): { mobile: number | null; desktop: number | null } => {
  const { surfaces } = resolveLook(look)
  return {
    mobile: surfaces.mobile ? worstContrast(surfaces.mobile) : null,
    desktop: surfaces.desktop ? worstContrast(surfaces.desktop) : null,
  }
}
