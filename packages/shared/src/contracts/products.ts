import { z } from 'zod'
import { optionalSlugSchema, moneySchema } from './common.js'
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
  // Peso (GRAMAS) e dimensões (MILÍMETROS) são OBRIGATÓRIOS: sem eles o frete não
  // cota, e um produto sem frete não vende. Exigir na criação (não só na
  // publicação) evita o produto nascer quebrado e o lojista descobrir no checkout.
  weight: z.number().int().positive('Informe o peso em gramas'),
  length: z.number().int().positive('Informe o comprimento em mm'),
  width: z.number().int().positive('Informe a largura em mm'),
  height: z.number().int().positive('Informe a altura em mm'),
  position: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
  /** @deprecated Use `ProductImage.variantId` — tem FK e aceita N imagens por variante. */
  imageId: z.string().nullable().optional(),
  /** Quais valores de opção esta variante representa. Vazio = produto sem opções. */
  options: z.array(variantOptionSchema).default([]),
})

export type CreateVariantInput = z.infer<typeof createVariantSchema>

/**
 * Edição de uma variante existente — o dado mais sensível (preço, estoque). Só os
 * campos editáveis em lugar, sem mexer na estrutura de opções. Dimensões e peso,
 * se enviados, seguem obrigatoriamente positivos.
 */
export const updateVariantSchema = z
  .object({
    sku: z.string().min(1, 'SKU obrigatório').max(80).trim(),
    barcode: z.string().max(80).nullable(),
    price: moneySchema,
    compareAtPrice: moneySchema.nullable(),
    costPrice: moneySchema.nullable(),
    weight: z.number().int().positive('Informe o peso em gramas'),
    length: z.number().int().positive('Informe o comprimento em mm'),
    width: z.number().int().positive('Informe a largura em mm'),
    height: z.number().int().positive('Informe a altura em mm'),
    isActive: z.boolean(),
  })
  .partial()

export type UpdateVariantInput = z.infer<typeof updateVariantSchema>

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
  /** @deprecated Use `ProductImage.variantId`. Mantido só para não quebrar clientes antigos. */
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
  /** null = imagem do produto, vale para qualquer variação. */
  variantId: z.string().nullable(),
  // Dimensões naturais: deixam o front reservar a caixa (sem layout shift) e
  // limitar o zoom ao que o arquivo aguenta. null em uploads antigos.
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
})

export type ProductImage = z.infer<typeof productImageSchema>

/**
 * Substitui a galeria inteira do produto. A API reconcilia por `uploadId`:
 * mantém as que continuam, cria as novas e apaga as ausentes. O `position` de
 * cada item define a ordem — a posição no array é o que vale.
 *
 * `variantId` só existe aqui, não no input de criação: na criação do produto as
 * variantes ainda não têm id, então o campo só poderia ser mentira.
 */
export const updateProductImagesSchema = z.object({
  images: z.array(
    productImageInputSchema.extend({ variantId: z.string().nullable().optional() }),
  ),
})

export type UpdateProductImagesInput = z.infer<typeof updateProductImagesSchema>

/**
 * Quais imagens valem para uma variação — a ordem de resolução ÚNICA do projeto.
 * Puro e no shared porque os dois lados dependem dela: a API congela a imagem do
 * item de carrinho/pedido com isto, e a loja monta a galeria com isto. Divergir
 * aqui é o que fazia o carrinho mostrar uma foto e a página do produto outra.
 *
 * 1. imagens da variação pedida
 * 2. imagens sem variação (do produto, servem a todas)
 * 3. imagens de OUTRAS variações ficam de fora — mostrar a foto da vela verde
 *    quando o cliente escolheu a azul é pior do que não mostrar nada.
 * 4. exceto se isso esvaziaria a galeria: produto com foto nunca renderiza vazio.
 */
type ImageLike = { variantId: string | null; position: number }

export const imagesForVariant = <T extends ImageLike>(
  images: T[],
  variantId: string | null,
): T[] => {
  const byPosition = (a: T, b: T) => a.position - b.position
  const own = variantId ? images.filter((i) => i.variantId === variantId) : []
  const shared = images.filter((i) => i.variantId === null)
  const picked = [...own.sort(byPosition), ...shared.sort(byPosition)]
  return picked.length > 0 ? picked : [...images].sort(byPosition)
}

/** A imagem que representa a variação — capa da galeria, linha do carrinho, item do pedido. */
export const pickVariantImage = <T extends ImageLike>(
  images: T[],
  variantId: string | null,
): T | undefined => imagesForVariant(images, variantId)[0]

// ── Produto ───────────────────────────────────────────────────────────────────

export const createProductSchema = z.object({
  name: z.string().min(1, 'Informe o nome').max(200).trim(),
  slug: optionalSlugSchema,
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
