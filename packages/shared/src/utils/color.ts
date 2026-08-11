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
export const oklchToHex = ({ l, c, h }: Oklch): string => {
  const hRad = (h * Math.PI) / 180
  const a = c * Math.cos(hRad)
  const b = c * Math.sin(hRad)

  const lms1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const lms2 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const lms3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  const r = 4.0767416621 * lms1 - 3.3077115913 * lms2 + 0.2309699292 * lms3
  const g = -1.2684380046 * lms1 + 2.6097574011 * lms2 - 0.3413193965 * lms3
  const bl = -0.0041960863 * lms1 - 0.7034186147 * lms2 + 1.707614701 * lms3

  const channel = (value: number): string =>
    Math.round(clamp(toGamma(value), 0, 1) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${channel(r)}${channel(g)}${channel(bl)}`
}

/** 'oklch(0.62 0.089 42.1)' — o mesmo formato literal já usado no globals.css. */
export const oklchToCss = ({ l, c, h }: Oklch): string => `oklch(${l} ${c} ${h})`

/**
 * Ponto em que uma cor deixa de aceitar texto claro. 0.62 foi escolhido por
 * teste com a paleta da loja: acima disso o branco perde contraste.
 */
const LIGHT_THRESHOLD = 0.62

/**
 * A cor de texto que fica legível sobre `background`.
 *
 * É a função que impede o lojista de quebrar a loja: se ele pudesse escolher o
 * `--primary-foreground` à mão, mais cedo ou mais tarde escolheria branco sobre
 * amarelo claro, e o botão ficaria ilegível. Aqui a escolha é derivada, sempre.
 *
 * Herda o matiz da cor de fundo com croma baixo em vez de usar preto/branco
 * puros: mantém o resultado "quente" ou "frio" junto com a marca, em vez de um
 * cinza morto que destoa da paleta.
 */
export const contrastForeground = (background: Oklch): Oklch =>
  background.l > LIGHT_THRESHOLD
    ? { l: 0.22, c: Math.min(background.c, 0.02), h: background.h }
    : { l: 0.99, c: Math.min(background.c, 0.01), h: background.h }

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
