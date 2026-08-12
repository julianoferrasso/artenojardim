/**
 * Conversão de cor entre hex e OKLCH — funções PURAS, sem dependência.
 *
 * Por que existe: o CSS da loja é todo em OKLCH (globals.css), mas o seletor de
 * cor do navegador (`<input type="color">`) só fala `#rrggbb`. Alguém tem que
 * traduzir, e a tradução precisa ser a MESMA nos dois lados — a API converte ao
 * gravar, o admin converte de volta para desenhar o formulário e o preview.
 * Por isso mora em `utils/` do pacote compartilhado, e não no `domain/` de um
 * módulo da API: `domain/` é interior do módulo, e o admin não pode importá-lo.
 *
 * OKLCH e não HSL: em HSL, dois tons com o mesmo `L` têm brilho percebido bem
 * diferente (amarelo 50% "queima", azul 50% é escuro). OKLCH é perceptualmente
 * uniforme, então `L` é uma medida confiável de claro/escuro — e é exatamente
 * disso que `contrastForeground` depende para decidir a cor do texto.
 *
 * Algoritmo: Björn Ottosson (https://bottosson.github.io/posts/oklab/).
 */

export type Oklch = {
  /** Luminosidade percebida, 0 (preto) a 1 (branco). */
  l: number
  /** Croma — 0 é cinza. Na prática raramente passa de 0.37 dentro do sRGB. */
  c: number
  /** Matiz em graus, 0–360. */
  h: number
}

/** Arredonda na casa que o CSS precisa e evita 0.6200000000000001 no JSON. */
const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** Gamma do sRGB → linear. A curva tem um trecho reto perto do preto. */
const toLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

/** Linear → gamma do sRGB. Inverso de `toLinear`. */
const toGamma = (channel: number): number =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055

/**
 * '#c47a5e' → { l, c, h }. Aceita com ou sem '#', maiúsculas ou minúsculas.
 * Formato inválido devolve preto em vez de lançar: esta função roda no preview
 * do admin a cada tecla digitada, e um '#c4' no meio da digitação não é erro —
 * é um estado intermediário. Quem valida de verdade é o Zod, no contrato.
 */
export const hexToOklch = (hex: string): Oklch => {
  const clean = hex.replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return { l: 0, c: 0, h: 0 }

  const r = toLinear(parseInt(clean.slice(0, 2), 16) / 255)
  const g = toLinear(parseInt(clean.slice(2, 4), 16) / 255)
  const b = toLinear(parseInt(clean.slice(4, 6), 16) / 255)

  // RGB linear → LMS (resposta dos cones do olho), depois raiz cúbica.
  const lms1 = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const lms2 = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const lms3 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  // LMS → OKLab (L claro/escuro, a verde/vermelho, b azul/amarelo).
  const l = 0.2104542553 * lms1 + 0.793617785 * lms2 - 0.0040720468 * lms3
  const a = 1.9779984951 * lms1 - 2.428592205 * lms2 + 0.4505937099 * lms3
  const bb = 0.0259040371 * lms1 + 0.7827717662 * lms2 - 0.808675766 * lms3

  // OKLab → polar. O +360 % 360 tira o negativo que atan2 devolve.
  const chroma = Math.hypot(a, bb)
  const hue = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360

  return {
    l: round(clamp(l, 0, 1), 3),
    c: round(chroma, 3),
    // Cinza não tem matiz: atan2(0,0) é 0, mas deixar 0 explícito evita que um
    // arredondamento devolva um hue aleatório para uma cor sem cor nenhuma.
    h: chroma < 0.0005 ? 0 : round(hue, 1),
  }
}

/**
 * { l, c, h } → '#c47a5e'.
 *
 * O clamp por canal é o tratamento de gamut: uma cor derivada pode cair fora do
 * sRGB, e o único consumidor daqui é o `<input type="color">`, que não
 * representa nada fora de sRGB de qualquer forma. O efeito colateral aceito é
 * que duas cores OKLCH distintas podem voltar como o mesmo hex — por isso o
 * banco guarda OKLCH (a verdade) e o hex é só a interface.
 */
/** OKLCH → RGB LINEAR (ainda sem gamma, podendo sair de [0,1] fora do gamut). */
const oklchToLinearRgb = ({ l, c, h }: Oklch): [number, number, number] => {
  const hRad = (h * Math.PI) / 180
  const a = c * Math.cos(hRad)
  const b = c * Math.sin(hRad)

  const lms1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const lms2 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const lms3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    4.0767416621 * lms1 - 3.3077115913 * lms2 + 0.2309699292 * lms3,
    -1.2684380046 * lms1 + 2.6097574011 * lms2 - 0.3413193965 * lms3,
    -0.0041960863 * lms1 - 0.7034186147 * lms2 + 1.707614701 * lms3,
  ]
}

export const oklchToHex = (color: Oklch): string => {
  const channel = (value: number): string =>
    Math.round(clamp(toGamma(value), 0, 1) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${oklchToLinearRgb(color).map(channel).join('')}`
}

/**
 * Razão de contraste WCAG entre duas cores (1 = idênticas, 21 = preto/branco).
 *
 * Existe porque "afastar a luminosidade num valor fixo" MENTE: com o mesmo ΔL um
 * rosa passa de 4.5:1 e um amarelo saturado fica em 3.3:1 — o croma pesa na
 * luminância percebida. Só medindo dá para garantir legibilidade em qualquer
 * tema que o lojista escolher.
 *
 * O clamp em [0,1] antes da luminância é o que o monitor faz de qualquer forma
 * com cor fora do gamut sRGB, então a conta bate com o pixel pintado.
 */
export const contrastRatio = (a: Oklch, b: Oklch): number => {
  const luminance = (color: Oklch): number => {
    const [r, g, bl] = oklchToLinearRgb(color).map((v) => clamp(v, 0, 1)) as [
      number,
      number,
      number,
    ]
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }

  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

/** 'oklch(0.62 0.089 42.1)' — o mesmo formato literal já usado no globals.css. */
export const oklchToCss = ({ l, c, h }: Oklch): string => `oklch(${l} ${c} ${h})`

/** Mínimo do WCAG AA para texto pequeno — e obrigação legal (LBI/eMAG). */
export const MIN_CONTRAST = 4.5

/**
 * A cor da marca quando ela é TINTA (texto, ícone, borda) sobre uma superfície.
 *
 * `contrastForeground` resolve o caso "marca como FUNDO" (devolve a cor do texto
 * que vai por cima). Esta resolve o inverso, que faltava: a marca escrevendo
 * SOBRE o fundo do lojista. Sem ela, um primary claro sobre um card claro dá
 * 1.07:1 — foi exatamente o bug dos ícones invisíveis.
 *
 * Preserva matiz e croma e só mexe na luminosidade: a marca continua sendo a
 * marca. O croma só cede quando o L sozinho não alcança o alvo — cor muito
 * saturada tem gamut estreito nos extremos, e aí não existe L que resolva.
 */
export const readableInk = (
  brand: Oklch,
  surfaces: Oklch | Oklch[],
  target: number = MIN_CONTRAST,
): Oklch => {
  // A tinta tem que ler em TODAS as superfícies onde vai aparecer, não só na
  // primeira: o mesmo texto cai sobre card, background e muted.
  const list = Array.isArray(surfaces) ? surfaces : [surfaces]
  const worst = (candidate: Oklch): number =>
    Math.min(...list.map((surface) => contrastRatio(candidate, surface)))

  // A direção vem da superfície MÉDIA: fundo claro pede tinta escura, e vice-versa.
  const meanL = list.reduce((sum, s) => sum + s.l, 0) / list.length
  const darken = meanL > 0.5
  const step = darken ? -0.02 : 0.02

  for (const chromaMultiplier of [1, 0.75, 0.5, 0.3, 0.15, 0]) {
    const c = round(clamp(brand.c * chromaMultiplier, 0, 0.4), 3)

    // Começa junto das superfícies e se afasta até bastar em todas elas.
    let l = darken
      ? Math.min(brand.l, ...list.map((s) => s.l))
      : Math.max(brand.l, ...list.map((s) => s.l))

    while (l >= 0 && l <= 1) {
      const candidate = { l: round(l, 3), c, h: brand.h }
      if (worst(candidate) >= target) return candidate
      l += step
    }
  }

  // Nem preto nem branco bastaram: as superfícies são intermediárias demais
  // (o admin avisa sobre isso). Devolve o extremo, que é o melhor possível.
  return darken ? { l: 0, c: 0, h: brand.h } : { l: 1, c: 0, h: brand.h }
}

/**
 * A cor de texto que fica legível sobre `background`.
 *
 * É a função que impede o lojista de quebrar a loja: se ele pudesse escolher o
 * `--primary-foreground` à mão, mais cedo ou mais tarde escolheria branco sobre
 * amarelo claro, e o botão ficaria ilegível. Aqui a escolha é derivada, sempre.
 *
 * Antes eram dois valores fixos (0.22 e 0.99) escolhidos por um limiar de L.
 * Não bastava: em fundo intermediário os dois ficavam abaixo de 4.5:1, e o
 * limiar apenas movia a faixa cega de lugar. Agora ESCOLHE a direção medindo as
 * duas e MEDE de novo até atingir o alvo — mesmo motor do `readableInk`.
 *
 * Herda o matiz do fundo com croma baixo em vez de preto/branco puros: mantém o
 * resultado quente ou frio junto com a paleta, em vez de um cinza morto.
 */
export const contrastForeground = (background: Oklch): Oklch => {
  const dark = { l: 0.22, c: Math.min(background.c, 0.02), h: background.h }
  const light = { l: 0.99, c: Math.min(background.c, 0.01), h: background.h }

  const darkRatio = contrastRatio(dark, background)
  const lightRatio = contrastRatio(light, background)

  // O que já basta, vence — preserva a aparência dos temas que hoje funcionam.
  if (darkRatio >= MIN_CONTRAST && darkRatio >= lightRatio) return dark
  if (lightRatio >= MIN_CONTRAST) return light

  // Fundo intermediário: nenhum extremo fixo basta. Empurra o mais promissor
  // até o alvo (ou até o limite físico, no caso da zona morta).
  return readableInk(darkRatio >= lightRatio ? dark : light, background)
}

/**
 * Deriva uma variação de uma cor: `card` e `muted` são o fundo um pouco mais
 * claro ou escuro, `border` é o fundo com mais croma. É o que permite o lojista
 * escolher UMA cor de fundo e receber a família inteira coerente.
 */
export const shiftLightness = (color: Oklch, deltaL: number, chromaMultiplier = 1): Oklch => ({
  l: round(clamp(color.l + deltaL, 0, 1), 3),
  c: round(clamp(color.c * chromaMultiplier, 0, 0.4), 3),
  h: color.h,
})

/**
 * As variáveis CSS dos BOTÕES.
 *
 * Separada de `deriveThemeVars` de propósito: aquela é consumida por toda a
 * bateria de testes e pela prévia, e não deve inchar com um parâmetro a mais
 * para quem só quer as cores base.
 *
 * `source` é de qual cor do tema o botão sai — é o "replicar" que o lojista
 * escolhe. `custom` é a cor própria dele. O TEXTO nunca é escolhido: sai de
 * `contrastForeground`, exatamente como o dos botões de hoje. É isso que
 * permite liberar a cor de fundo sem liberar botão ilegível.
 */
export const deriveButtonVars = (
  theme: { primary: Oklch; secondary: Oklch; accent: Oklch; background: Oklch },
  buttons?: {
    primary?: { source: string; custom: Oklch | null }
    secondary?: { source: string; custom: Oklch | null }
  },
): Record<string, string> => {
  const { background } = theme

  /*
   * `buttons` é opcional porque loja e API sobem em momentos diferentes: uma
   * resposta antiga em cache (sem a chave) derrubaria a home inteira. Sem a
   * configuração, os dois níveis caem na marca — que é o default.
   */
  const fallback = { source: 'primary', custom: null }
  const primaryStyle = buttons?.primary ?? fallback
  const secondaryStyle = buttons?.secondary ?? fallback

  // As mesmas superfícies de deriveThemeVars — a tinta do botão contornado
  // precisa ler nas três, igual à tinta da marca.
  const SURFACE_MAX_CHROMA = 0.06
  const surface = (deltaL: number, chromaMultiplier: number): Oklch => {
    const shifted = shiftLightness(background, deltaL, chromaMultiplier)
    return { ...shifted, c: Math.min(shifted.c, SURFACE_MAX_CHROMA) }
  }
  const surfaces = [surface(0.012, 0.5), background, surface(-0.03, 1.5)]

  const resolve = (style: { source: string; custom: Oklch | null }): Oklch => {
    if (style.source === 'custom') return style.custom ?? theme.primary
    if (style.source === 'secondary') return theme.secondary
    if (style.source === 'accent') return theme.accent
    return theme.primary
  }

  const vars = (name: string, style: { source: string; custom: Oklch | null }) => {
    const color = resolve(style)
    return {
      [`--btn-${name}`]: oklchToCss(color),
      [`--btn-${name}-foreground`]: oklchToCss(contrastForeground(color)),
      // Para o estilo contornado: a cor como TINTA sobre as superfícies claras.
      [`--btn-${name}-ink`]: oklchToCss(readableInk(color, surfaces)),
    }
  }

  return { ...vars('primary', primaryStyle), ...vars('secondary', secondaryStyle) }
}

/**
 * Faixa de fundo em que NENHUMA tinta atinge 4.5:1 sobre as superfícies
 * derivadas — nem preto, nem branco. É limite físico do par de luminosidades,
 * não da fórmula: o fundo fica a meio caminho dos dois extremos.
 *
 * Não dá para consertar sem mudar a aparência de TODOS os temas, então o admin
 * avisa e deixa o lojista decidir.
 */
export const DEAD_ZONE = { min: 0.5, max: 0.58 }

export const isDeadZone = (backgroundLightness: number): boolean =>
  backgroundLightness >= DEAD_ZONE.min && backgroundLightness <= DEAD_ZONE.max

/**
 * As variáveis CSS de COR do tema — a ÚNICA fonte das derivações.
 *
 * Loja e admin importam daqui: a loja para injetar no <style>, o admin para
 * montar a prévia. Antes cada um tinha sua cópia da fórmula, com um comentário
 * pedindo para manter as duas em dia — o tipo de acordo que ninguém cumpre.
 * Se a prévia mente, o lojista configura no escuro.
 *
 * Não inclui `--radius`: é enum, não cor, e vem de THEME_RADIUS_REM.
 */
export const deriveThemeVars = (theme: {
  primary: Oklch
  secondary: Oklch
  accent: Oklch
  background: Oklch
}): Record<string, string> => {
  const { primary, secondary, accent, background } = theme

  /*
   * Os deltas reproduzem as relações que o globals.css já tinha entre background
   * (0.985), card (0.997), muted (0.955) e border (0.905) — é o que faz o tema
   * default renderizar a loja idêntica ao que estava no ar.
   *
   * O TETO de croma não é decoração: multiplicar o croma de um fundo já saturado
   * cria uma superfície tão colorida que nem preto puro atinge 4.5:1 sobre ela.
   * Com fundo azul c=0.2, o `muted` ia a 0.3 e travava a tinta em 4.39. O teto
   * não afeta os temas de croma baixo — no default, 0.008 × 1.5 = 0.012.
   */
  const SURFACE_MAX_CHROMA = 0.06
  const surface = (deltaL: number, chromaMultiplier: number): Oklch => {
    const shifted = shiftLightness(background, deltaL, chromaMultiplier)
    return { ...shifted, c: Math.min(shifted.c, SURFACE_MAX_CHROMA) }
  }

  const card = surface(0.012, 0.5)
  const muted = surface(-0.03, 1.5)
  const border = surface(-0.08, 2.25)
  const bodyText = contrastForeground(background)

  /*
   * A tinta é derivada contra as TRÊS superfícies de uma vez, porque o mesmo
   * texto cai sobre as três. Escolher "a mais exigente" pelo L daria errado:
   * `muted` tem croma maior, e croma alto sobe a luminância — um `muted` mais
   * escuro pode exigir mais que um `card` mais claro.
   */
  const surfaces = [card, background, muted]

  const ink = (color: Oklch): string => oklchToCss(readableInk(color, surfaces))
  const on = (color: Oklch): string => oklchToCss(contrastForeground(color))

  return {
    '--background': oklchToCss(background),
    '--foreground': oklchToCss(bodyText),

    '--card': oklchToCss(card),
    '--card-foreground': oklchToCss(bodyText),
    '--popover': oklchToCss(card),
    '--popover-foreground': oklchToCss(bodyText),

    '--primary': oklchToCss(primary),
    '--primary-foreground': on(primary),
    // A marca como TINTA. Sem este token, `text-primary` sobre card claro some.
    '--primary-ink': ink(primary),

    '--secondary': oklchToCss(secondary),
    '--secondary-foreground': on(secondary),

    '--accent': oklchToCss(accent),
    '--accent-foreground': on(accent),

    '--muted': oklchToCss(muted),
    /*
     * Texto secundário POR CONTRASTE, não por deslocamento fixo. A fórmula
     * antiga (`bodyText.l ± 0.26`) presumia fundo claro e, num fundo escuro,
     * devolvia literalmente a cor do próprio fundo — 1.00:1, texto invisível.
     *
     * Parte da PRÓPRIA superfície, não do texto principal: assim a busca para no
     * primeiro L que atinge 4.5:1 e o resultado fica um degrau acima do fundo,
     * não colado no texto principal. Partir de `bodyText` devolvia o extremo
     * (15:1) e matava a hierarquia entre texto primário e secundário.
     */
    '--muted-foreground': oklchToCss(
      readableInk({ l: muted.l, c: clamp(background.c * 2, 0, 0.4), h: background.h }, muted),
    ),

    '--border': oklchToCss(border),
    '--input': oklchToCss(border),
    '--ring': oklchToCss(primary),
  }
}
