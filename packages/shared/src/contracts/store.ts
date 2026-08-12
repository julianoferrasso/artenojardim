import { z } from 'zod'

/**
 * Flags PÚBLICAS. A loja e o admin leem daqui para esconder o que ainda não
 * está no ar. Flag liga/desliga o que JÁ está pronto — código pela metade é branch.
 */
export const publicFlagsSchema = z.object({
  reviews: z.boolean(),
  wishlist: z.boolean(),
  giftCards: z.boolean(),
})

export type PublicFlags = z.infer<typeof publicFlagsSchema>

export const storeAddressSchema = z.object({
  zipCode: z.string(),
  street: z.string(),
  number: z.string(),
  complement: z.string().nullable(),
  district: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
})

/**
 * ── Tema da loja ────────────────────────────────────────────────────────────
 *
 * Vive em `Setting` com a chave `theme`, não numa coluna de `Store`: é
 * configuração que o lojista mexe, e o Setting já entrega schema tipado, default
 * e cache (ver shared/settings.ts na API). Zero migration.
 *
 * Cor em OKLCH e não em hex porque é o formato que o CSS da loja usa. O admin
 * edita em hex — a conversão acontece na ESCRITA, no service, para que a leitura
 * (que roda em todo SSR da loja) receba o valor pronto.
 */
export const oklchSchema = z.object({
  l: z.number().min(0).max(1),
  c: z.number().min(0).max(0.4),
  h: z.number().min(0).max(360),
})

export type Oklch = z.infer<typeof oklchSchema>

/**
 * Raio como enum e não número livre: evita `--radius: 47px` e mantém a escala
 * coerente. O `@theme inline` do globals.css deriva sm/md/lg/xl com calc().
 */
export const THEME_RADIUS = ['none', 'small', 'medium', 'large'] as const
export const themeRadiusSchema = z.enum(THEME_RADIUS)
export type ThemeRadius = z.infer<typeof themeRadiusSchema>

/** `medium` é 0.75rem porque esse era o --radius fixo da loja: o default não muda nada. */
export const THEME_RADIUS_REM: Record<ThemeRadius, string> = {
  none: '0rem',
  small: '0.375rem',
  medium: '0.75rem',
  large: '1.25rem',
}

/**
 * Estilo das bolinhas de ícone (selos da home, redes sociais do rodapé).
 *
 * É escolha de APARÊNCIA, nunca de legibilidade: as duas opções têm contraste
 * garantido por construção — `filled` usa o par --primary/--primary-foreground,
 * `outlined` usa --primary-ink, ambos derivados por contraste medido. O lojista
 * não consegue escolher uma combinação ilegível, que é o ponto.
 */
export const THEME_BADGE_STYLE = ['filled', 'outlined'] as const
export const themeBadgeStyleSchema = z.enum(THEME_BADGE_STYLE)
export type ThemeBadgeStyle = z.infer<typeof themeBadgeStyleSchema>

/**
 * As classes de cada estilo. Vive no contrato — e não em cada app — porque a
 * loja PINTA a bolinha e o admin a mostra na prévia: se as duas listas
 * divergirem, o lojista escolhe uma coisa e recebe outra.
 */
export const BADGE_STYLE_CLASSES: Record<ThemeBadgeStyle, string> = {
  filled: 'bg-primary text-primary-foreground',
  outlined: 'border-2 border-primary-ink bg-card text-primary-ink',
}

/**
 * ── Botões ──────────────────────────────────────────────────────────────────
 *
 * De qual cor do tema cada nível de botão sai. `custom` é a cor própria do
 * lojista; nas outras ele "replica" uma cor que já escolheu.
 *
 * NÃO existe a opção "fundo": botão da cor do fundo é botão invisível — mesmo
 * com o texto legível, a superfície clicável some contra a página. Quem quer
 * isso quer o botão CONTORNADO, que é `emphasis`, não cor.
 */
export const BUTTON_COLOR_SOURCE = ['primary', 'secondary', 'accent', 'custom'] as const
export const buttonColorSourceSchema = z.enum(BUTTON_COLOR_SOURCE)
export type ButtonColorSource = z.infer<typeof buttonColorSourceSchema>

/** Sólido (preenchido) ou discreto (contornado). */
export const BUTTON_EMPHASIS = ['solid', 'quiet'] as const
export const buttonEmphasisSchema = z.enum(BUTTON_EMPHASIS)
export type ButtonEmphasis = z.infer<typeof buttonEmphasisSchema>

/**
 * O tema como fica no banco.
 *
 * Só QUATRO cores são editáveis. Todos os `-foreground`, além de card, muted,
 * border e input, são DERIVADOS no momento de montar o CSS — se o lojista
 * pudesse escolher a cor do texto, mais cedo ou mais tarde escolheria branco
 * sobre amarelo claro e o botão ficaria ilegível.
 *
 * `--destructive`, `--sale`, `--warning` e `--success` ficam FORA: são semântica
 * universal (vermelho é erro em qualquer marca), não identidade. As sombras
 * também, por decisão registrada no próprio globals.css.
 */
/** Um nível de botão, como fica no banco: cor própria em OKLCH. */
const buttonStyleSchema = z.object({
  source: buttonColorSourceSchema,
  custom: oklchSchema.nullable(),
  emphasis: buttonEmphasisSchema,
})

export type ButtonStyle = z.infer<typeof buttonStyleSchema>

export const storeButtonsSchema = z.object({
  primary: buttonStyleSchema,
  secondary: buttonStyleSchema,
})

export type StoreButtons = z.infer<typeof storeButtonsSchema>

/**
 * Reproduz o que estava fixo no CSS: principal = marca sólida, secundário =
 * marca contornada. Subir não muda nada até o lojista mexer.
 */
export const DEFAULT_STORE_BUTTONS: StoreButtons = {
  primary: { source: 'primary', custom: null, emphasis: 'solid' },
  secondary: { source: 'primary', custom: null, emphasis: 'quiet' },
}

export const storeThemeSchema = z.object({
  primary: oklchSchema,
  secondary: oklchSchema,
  accent: oklchSchema,
  background: oklchSchema,
  radius: themeRadiusSchema,
  /*
   * `.default()` no OBJETO inteiro, não campo a campo: os temas já gravados não
   * têm a chave `buttons`, e sem isto o safeParse da leitura rejeitaria o tema
   * e a loja voltaria à paleta de fábrica. Já aconteceu uma vez.
   */
  buttons: storeButtonsSchema.default(DEFAULT_STORE_BUTTONS),
  /*
   * `.default()` é obrigatório em campo novo: o tema vive como JSON em Setting e
   * os já gravados não têm esta chave. Sem o default, o safeParse da leitura
   * rejeitaria o tema inteiro e a loja voltaria à paleta de fábrica.
   */
  badgeStyle: themeBadgeStyleSchema.default('filled'),
  logoId: z.string().nullable(),
})

export type StoreTheme = z.infer<typeof storeThemeSchema>

/**
 * Exatamente os valores que hoje estão fixos no globals.css da loja. Enquanto
 * ninguém configurar nada, a loja renderiza idêntica ao que já está no ar —
 * é o que torna esta feature segura de subir.
 */
export const DEFAULT_STORE_THEME: StoreTheme = {
  primary: { l: 0.56, c: 0.11, h: 30 },
  secondary: { l: 0.945, c: 0.025, h: 35 },
  accent: { l: 0.93, c: 0.032, h: 55 },
  background: { l: 0.985, c: 0.008, h: 75 },
  // 'medium' = 0.75rem = o valor que já estava no globals.css. NÃO troque para
  // 'large' achando que é "o mais bonito": o default existe para não mudar nada.
  radius: 'medium',
  badgeStyle: 'filled',
  buttons: DEFAULT_STORE_BUTTONS,
  logoId: null,
}

/** O que a loja recebe: cores em OKLCH e a URL do logo já resolvida. */
export const publicThemeSchema = storeThemeSchema.omit({ logoId: true }).extend({
  logoUrl: z.string().nullable(),
})

export type PublicTheme = z.infer<typeof publicThemeSchema>

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor no formato #rrggbb')

/** O mesmo nível de botão visto pelo formulário: cor própria em hex. */
const updateButtonStyleSchema = z.object({
  source: buttonColorSourceSchema,
  custom: hexColorSchema.nullable(),
  emphasis: buttonEmphasisSchema,
})

/**
 * O que o ADMIN envia: hex, porque é o que `<input type="color">` fala. O
 * service converte para OKLCH antes de gravar.
 */
export const updateStoreThemeSchema = z.object({
  primary: hexColorSchema,
  secondary: hexColorSchema,
  accent: hexColorSchema,
  background: hexColorSchema,
  radius: themeRadiusSchema,
  /*
   * Sem `.default()` aqui, ao contrário do storeThemeSchema: o formulário SEMPRE
   * manda o campo, e um default no schema de ENTRADA faria o Zod separar tipo de
   * entrada e de saída — o que deixa o useForm ambíguo sem ganho nenhum.
   */
  badgeStyle: themeBadgeStyleSchema,
  buttons: z.object({
    primary: updateButtonStyleSchema,
    secondary: updateButtonStyleSchema,
  }),
  logoId: z.string().nullable(),
})

export type UpdateStoreThemeInput = z.infer<typeof updateStoreThemeSchema>

/** O que o formulário do admin lê: as mesmas cores, de volta em hex. */
export const adminThemeSchema = updateStoreThemeSchema.extend({
  logoUrl: z.string().nullable(),
})

export type AdminTheme = z.infer<typeof adminThemeSchema>

/**
 * O que a loja pública precisa saber sobre a Store. NÃO expõe `document`,
 * `id` nem nada operacional — é resposta pública, cacheável.
 */
export const publicStoreSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  currency: z.string(),
  locale: z.string(),
  timezone: z.string(),
  flags: publicFlagsSchema,
  theme: publicThemeSchema,
})

export type PublicStore = z.infer<typeof publicStoreSchema>

export const publicStoreResponseSchema = z.object({ data: publicStoreSchema })

export const healthResponseSchema = z.object({
  data: z.object({
    status: z.literal('ok'),
    version: z.string(),
    uptime: z.number(),
    database: z.enum(['up', 'down']),
  }),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
