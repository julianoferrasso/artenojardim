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
export const storeThemeSchema = z.object({
  primary: oklchSchema,
  secondary: oklchSchema,
  accent: oklchSchema,
  background: oklchSchema,
  radius: themeRadiusSchema,
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
