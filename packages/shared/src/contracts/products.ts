import { z } from 'zod'
import { slugSchema, moneySchema } from './common.js'
import { productStatusSchema } from '../constants/enums.js'

/**
 * Contratos do catálogo. O Product é marketing; a Variant é comércio. Preço,
 * SKU, peso e dimensões vivem SEMPRE na variante.
 */

// ── Variante ──────────────────────────────────────────────────────────────────

/** Combinação de opções desta variante: [{option:"Cor", value:"Verde"}, ...]. */
export const variantOptionSchema = z.object({
  option: z.string().min(1).max(60),
  value: z.string().min(1).max(60),
})

export type VariantOption = z.infer<typeof variantOptionSchema>
export type OptionSpec = { name: string; values: string[] }

/**
 * Produto cartesiano das opções → combinações. PURO, no shared porque os DOIS
 * lados usam: a API para materializar as variantes, o admin para pré-visualizar
 * o grid de variações. Fonte única evita que a prévia divirja do que é gravado.
 *
 * Sem opções → uma combinação vazia (a variante "Default"). Loop explícito, não
 * `reduce<Array<Array<...>>>`: o `>>>` de fechamento é lido como operador de
 * shift pelo esbuild e a expressão vira `false`.
 */
export const cartesian = (options: OptionSpec[]): VariantOption[][] => {
  let acc: VariantOption[][] = [[]]
  for (const opt of options) {
    acc = acc.flatMap((combo) => opt.values.map((value) => [...combo, { option: opt.name, value }]))
  }
  return acc
}

/** Chave canônica de uma combinação, independente da ordem das opções. */
export const optionKey = (options: VariantOption[]): string =>
  options
    .map((o) => `${o.option.toLowerCase().trim()}=${o.value.toLowerCase().trim()}`)
    .sort()
    .join('|')

export const createVariantSchema = z.object({
  sku: z.string().min(1, 'SKU obrigatório').max(80).trim(),
  barcode: z.string().max(80).optional(),
  price: moneySchema,
  compareAtPrice: moneySchema.optional(),
  costPrice: moneySchema.optional(),
  // Peso em GRAMAS. Publicar sem peso é bloqueado no service: sem ele não há frete.
  weight: z.number().int().nonnegative().default(0),
  length: z.number().int().nonnegative().default(0),
  width: z.number().int().nonnegative().default(0),
  height: z.number().int().nonnegative().default(0),
  position: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
  imageId: z.string().nullable().optional(),
  /** Quais valores de opção esta variante representa. Vazio = produto sem opções. */
  options: z.array(variantOptionSchema).default([]),
})

export type CreateVariantInput = z.infer<typeof createVariantSchema>

export const variantSchema = z.object({
  id: z.string(),
  sku: z.string(),
  barcode: z.string().nullable(),
  price: z.number().int(),
  compareAtPrice: z.number().int().nullable(),
  costPrice: z.number().int().nullable(),
  weight: z.number().int(),
  length: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  position: z.number().int(),
  isActive: z.boolean(),
  imageId: z.string().nullable(),
  options: z.array(variantOptionSchema),
})

export type Variant = z.infer<typeof variantSchema>

// ── Imagem ────────────────────────────────────────────────────────────────────

export const productImageInputSchema = z.object({
  uploadId: z.string().min(1),
  alt: z.string().max(200).optional(),
  position: z.number().int().nonnegative().default(0),
})

export const productImageSchema = z.object({
  id: z.string(),
  uploadId: z.string(),
  url: z.string(),
  alt: z.string().nullable(),
  position: z.number().int(),
})

export type ProductImage = z.infer<typeof productImageSchema>

// ── Produto ───────────────────────────────────────────────────────────────────

export const createProductSchema = z.object({
  name: z.string().min(1, 'Informe o nome').max(200).trim(),
  slug: slugSchema.optional(),
  description: z.string().max(20000).optional(),
  shortDescription: z.string().max(500).optional(),
  status: productStatusSchema.default('DRAFT'),
  brand: z.string().max(120).optional(),
  tags: z.array(z.string().max(60)).max(30).default([]),
  categoryIds: z.array(z.string()).default([]),
  images: z.array(productImageInputSchema).default([]),
  seoTitle: z.string().max(200).optional(),
  seoDescription: z.string().max(400).optional(),
  /**
   * Toda criação manda ao menos uma variante. Um produto sem opções manda uma
   * variante com `options: []` — que o service materializa como "Default Title".
   * Vazio de verdade é erro: não existe produto sem nada vendável.
   */
  variants: z.array(createVariantSchema).min(1, 'O produto precisa de ao menos uma variante'),
})

export type CreateProductInput = z.infer<typeof createProductSchema>

// No update tudo é opcional; variantes têm fluxo próprio (ver updateProductSchema).
export const updateProductSchema = createProductSchema
  .omit({ variants: true })
  .partial()

export type UpdateProductInput = z.infer<typeof updateProductSchema>

export const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  shortDescription: z.string().nullable(),
  status: productStatusSchema,
  brand: z.string().nullable(),
  tags: z.array(z.string()),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  categoryIds: z.array(z.string()),
  images: z.array(productImageSchema),
  variants: z.array(variantSchema),
  // Faixa de preço: min e max entre as variantes. O card da vitrine mostra "a
  // partir de X" sem ter que carregar todas as variantes.
  priceRange: z.object({ min: z.number().int(), max: z.number().int() }),
})

export type Product = z.infer<typeof productSchema>

/** Versão enxuta para listagem — sem descrição de 20 KB nem todas as variantes. */
export const productListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: productStatusSchema,
  thumbnailUrl: z.string().nullable(),
  priceRange: z.object({ min: z.number().int(), max: z.number().int() }),
  variantCount: z.number().int(),
  updatedAt: z.string(),
})

export type ProductListItem = z.infer<typeof productListItemSchema>

/** Query de listagem no admin. */
export const productListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(24),
  status: productStatusSchema.optional(),
  categoryId: z.string().optional(),
  q: z.string().max(120).optional(),
  sort: z.string().optional(),
})

export type ProductListQuery = z.infer<typeof productListQuerySchema>
