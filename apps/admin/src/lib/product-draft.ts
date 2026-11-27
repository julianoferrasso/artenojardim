import {
  BLOCKER_MESSAGES,
  ERROR_CODES,
  cartesian,
  optionKey,
  publishBlockers,
  type CreateProductInput,
  type CreateVariantInput,
  type OptionSpec,
  type Product,
  type ProductImage,
  type UpdateProductImagesInput,
  type UpdateProductInput,
  type UpdateVariantInput,
  type Upload,
  type Variant,
  type VariantOption,
} from '@ecommerce/shared/contracts'
import type { ProductStatus } from '@ecommerce/shared/constants'
import { parseProductionDays, toAvailabilityValue, type AvailabilityValue } from '@/components/availability-editor'
import { toStock } from './inventory'
import { ApiError } from './api'

/**
 * O rascunho do formulário de produto e as conversões dele ↔ API. Funções puras:
 * a tela guarda o rascunho, compara com o servidor para saber o que mudou e só
 * converte para o contrato na hora de salvar.
 *
 * Números ficam como TEXTO no rascunho (o que o lojista digitou, com vírgula) e
 * viram inteiros só na borda: gramas, milímetros, centavos.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

export type ProductFields = {
  name: string
  shortDescription: string
  description: string
  brand: string
  /** Texto "vaso, cerâmica"; vira array na borda. */
  tags: string
  categoryIds: string[]
  isFeatured: boolean
  seoTitle: string
  seoDescription: string
  availability: AvailabilityValue
}

export type DraftImage = {
  uploadId: string
  url: string
  alt: string
  variantId: string | null
  width: number | null
  height: number | null
}

export type VariantDraft = {
  /** id na edição; a combinação de opções na criação. */
  key: string
  options: VariantOption[]
  /** Vazio na criação = usa o SKU sugerido. */
  sku: string
  price: number
  /** Preço "de" (riscado na loja). 0 = sem. */
  compareAtPrice: number
  /** Criação: estoque inicial. Edição: contagem física; null = não mexido (segue o servidor). */
  stock: string | null
  weight: string
  length: string
  width: string
  height: string
  isActive: boolean
}

export type OptionDraft = { id: string; name: string; values: string[] }

/** Chave → mensagem. Variação: `v:<key>:<campo>`. */
export type FieldErrors = Record<string, string>

export const variantField = (key: string, field: string): string => `v:${key}:${field}`

// ── Números ──────────────────────────────────────────────────────────────────

/** "12,5" → 12.5. Vazio ou lixo → 0. */
export const parseDecimal = (text: string): number => {
  const n = Number(text.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export const toGrams = (text: string): number => Math.round(parseDecimal(text))
export const cmToMm = (text: string): number => Math.round(parseDecimal(text) * 10)

/** 125 mm → "12,5". 0 → "" (campo vazio, não "0"). */
export const mmToCmText = (mm: number): string => (mm ? String(mm / 10).replace('.', ',') : '')
const intText = (n: number): string => (n ? String(n) : '')

// ── Campos do produto ────────────────────────────────────────────────────────

export const emptyFields = (): ProductFields => ({
  name: '',
  shortDescription: '',
  description: '',
  brand: '',
  tags: '',
  categoryIds: [],
  isFeatured: false,
  seoTitle: '',
  seoDescription: '',
  availability: { stockPolicy: 'STOCK_ONLY', productionDays: '' },
})

export const fieldsFromProduct = (p: Product): ProductFields => ({
  name: p.name,
  shortDescription: p.shortDescription ?? '',
  description: p.description ?? '',
  brand: p.brand ?? '',
  tags: p.tags.join(', '),
  categoryIds: p.categoryIds,
  isFeatured: p.isFeatured,
  seoTitle: p.seoTitle ?? '',
  seoDescription: p.seoDescription ?? '',
  availability: toAvailabilityValue(p),
})

export const parseTags = (raw: string): string[] => [
  ...new Set(
    raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  ),
]

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000')

/**
 * Só o que mudou, ou null. Texto apagado vai como '' — a API grava null. Mandar
 * `undefined` era o bug: o campo não apagava e o "Salvo" mentia.
 */
export const productPatch = (p: Product, f: ProductFields): UpdateProductInput | null => {
  const patch: UpdateProductInput = {}
  if (f.name.trim() !== p.name) patch.name = f.name.trim()
  if (f.shortDescription.trim() !== (p.shortDescription ?? '')) patch.shortDescription = f.shortDescription.trim()
  // Sempre a string: vazia é como a descrição se apaga (a API grava null).
  if (f.description !== (p.description ?? '')) patch.description = f.description
  if (f.brand.trim() !== (p.brand ?? '')) patch.brand = f.brand.trim()
  if (!sameSet(parseTags(f.tags), p.tags)) patch.tags = parseTags(f.tags)
  if (!sameSet(f.categoryIds, p.categoryIds)) patch.categoryIds = f.categoryIds
  if (f.isFeatured !== p.isFeatured) patch.isFeatured = f.isFeatured
  if (f.seoTitle.trim() !== (p.seoTitle ?? '')) patch.seoTitle = f.seoTitle.trim()
  if (f.seoDescription.trim() !== (p.seoDescription ?? '')) patch.seoDescription = f.seoDescription.trim()

  const { stockPolicy } = f.availability
  if (stockPolicy !== p.stockPolicy) patch.stockPolicy = stockPolicy
  // Em pronta entrega o prazo guardado fica: voltando à encomenda, ele já vem preenchido.
  if (stockPolicy !== 'STOCK_ONLY') {
    const parsed = parseProductionDays(f.availability)
    if (parsed.ok && parsed.days !== p.productionDays) patch.productionDays = parsed.days
    if (!parsed.ok) patch.stockPolicy = stockPolicy // o validate barra antes; aqui só marca dirty
  }

  return Object.keys(patch).length > 0 ? patch : null
}

// ── Imagens ──────────────────────────────────────────────────────────────────

export const imageFromProduct = (img: ProductImage): DraftImage => ({
  uploadId: img.uploadId,
  url: img.url,
  alt: img.alt ?? '',
  variantId: img.variantId,
  width: img.width,
  height: img.height,
})

export const imageFromUpload = (u: Upload): DraftImage => ({
  uploadId: u.id,
  url: u.url,
  alt: '',
  variantId: null,
  width: u.width,
  height: u.height,
})

export const imagesPatch = (p: Product, images: DraftImage[]): UpdateProductImagesInput['images'] | null => {
  const changed =
    images.length !== p.images.length ||
    images.some((img, i) => {
      const server = p.images[i]
      return (
        !server ||
        img.uploadId !== server.uploadId ||
        img.alt.trim() !== (server.alt ?? '') ||
        img.variantId !== server.variantId
      )
    })
  if (!changed) return null
  return images.map((img, i) => ({
    uploadId: img.uploadId,
    alt: img.alt.trim() || undefined,
    position: i,
    variantId: img.variantId,
  }))
}

/**
 * Abaixo disto o zoom da loja não tem detalhe para mostrar: ele é limitado pela
 * resolução real da foto, e nenhum código cria pixel que o arquivo não tem.
 */
export const MIN_ZOOMABLE_SIDE = 1200

export const isSmallImage = (img: Pick<DraftImage, 'width' | 'height'>): boolean =>
  img.width !== null && img.height !== null && Math.max(img.width, img.height) < MIN_ZOOMABLE_SIDE

// ── Variações ────────────────────────────────────────────────────────────────

/** Opção implícita de produto sem opções (o service grava "Título=Default Title"). */
export const isImplicitOption = (o: VariantOption): boolean => o.value === 'Default Title'

export const hasRealOptions = (variants: Pick<Variant, 'options'>[]): boolean =>
  variants.some((v) => v.options.some((o) => !isImplicitOption(o)))

export const variantLabel = (options: VariantOption[]): string =>
  options
    .filter((o) => !isImplicitOption(o))
    .map((o) => o.value)
    .join(' / ')

export const emptyVariant = (key = 'default', options: VariantOption[] = []): VariantDraft => ({
  key,
  options,
  sku: '',
  price: 0,
  compareAtPrice: 0,
  stock: '',
  weight: '',
  length: '',
  width: '',
  height: '',
  isActive: true,
})

export const variantFromServer = (v: Variant): VariantDraft => ({
  key: v.id,
  options: v.options,
  sku: v.sku,
  price: v.price,
  compareAtPrice: v.compareAtPrice ?? 0,
  stock: null,
  weight: intText(v.weight),
  length: mmToCmText(v.length),
  width: mmToCmText(v.width),
  height: mmToCmText(v.height),
  isActive: v.isActive,
})

/** Só os campos que mudaram, ou null. Estoque não entra: vira movimento no razão. */
export const variantPatch = (v: Variant, d: VariantDraft): UpdateVariantInput | null => {
  const patch: UpdateVariantInput = {}
  if (d.sku.trim() !== v.sku) patch.sku = d.sku.trim()
  if (d.price !== v.price) patch.price = d.price
  if (d.compareAtPrice !== (v.compareAtPrice ?? 0)) patch.compareAtPrice = d.compareAtPrice || null
  if (toGrams(d.weight) !== v.weight) patch.weight = toGrams(d.weight)
  if (cmToMm(d.length) !== v.length) patch.length = cmToMm(d.length)
  if (cmToMm(d.width) !== v.width) patch.width = cmToMm(d.width)
  if (cmToMm(d.height) !== v.height) patch.height = cmToMm(d.height)
  if (d.isActive !== v.isActive) patch.isActive = d.isActive
  return Object.keys(patch).length > 0 ? patch : null
}

/** A contagem a gravar, ou null se o estoque não mudou. */
export const stockCount = (d: VariantDraft, onHand: number | undefined): number | null =>
  d.stock !== null && onHand !== undefined && toStock(d.stock) !== onHand ? toStock(d.stock) : null

// ── SKU sugerido ─────────────────────────────────────────────────────────────

const STOPWORDS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'COM', 'PARA', 'EM', 'A', 'O', 'AS', 'OS'])

const skuWords = (text: string): string[] =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((w) => w && !STOPWORDS.has(w))

/** "Vela aromática de lavanda" + P → "VELA-AROMATICA-LAVANDA-P". Só sugestão: a API checa a unicidade. */
export const suggestSku = (name: string, options: VariantOption[]): string => {
  let base = ''
  for (const word of skuWords(name)) {
    const next = base ? `${base}-${word}` : word
    if (next.length > 40) break
    base = next
  }
  const suffix = options
    .filter((o) => !isImplicitOption(o))
    // 20 letras: "Capim-limão grande" e "Capim-limão gigante" não podem virar o mesmo SKU.
    .map((o) => skuWords(o.value).join('').slice(0, 20))
    .filter(Boolean)
  return [base || 'PRODUTO', ...suffix].join('-').slice(0, 80)
}

/** O SKU que vai para a API: o digitado, ou a sugestão. */
export const resolvedSku = (d: VariantDraft, name: string): string => d.sku.trim() || suggestSku(name, d.options)

// ── Opções (criação) ─────────────────────────────────────────────────────────

/** Limite do grid: acima disso a criação vira uma transação de centenas de inserts. */
export const MAX_VARIANTS = 100

export const optionSpecs = (options: OptionDraft[]): OptionSpec[] =>
  options
    .map((o) => ({ name: o.name.trim(), values: o.values }))
    .filter((o) => o.name && o.values.length > 0)

/**
 * Recalcula o grid a partir das opções, preservando o que já foi digitado em
 * cada combinação (casada pela chave canônica). Combinação nova herda preço,
 * peso e medidas do `template` — quase sempre iguais entre variações.
 */
export const regenerateVariants = (
  specs: OptionSpec[],
  current: VariantDraft[],
  template: VariantDraft,
): VariantDraft[] => {
  if (specs.length === 0) return []
  const byKey = new Map(current.map((v) => [v.key, v]))
  return cartesian(specs).map((combo) => {
    const key = optionKey(combo)
    const existing = byKey.get(key)
    if (existing) return { ...existing, options: combo }
    return { ...template, key, options: combo, sku: '', stock: '', isActive: true }
  })
}

// ── Criação ──────────────────────────────────────────────────────────────────

export const toVariantInput = (d: VariantDraft, name: string, position: number): CreateVariantInput => ({
  sku: resolvedSku(d, name),
  price: d.price,
  ...(d.compareAtPrice ? { compareAtPrice: d.compareAtPrice } : {}),
  weight: toGrams(d.weight),
  length: cmToMm(d.length),
  width: cmToMm(d.width),
  height: cmToMm(d.height),
  position,
  isActive: d.isActive,
  initialStock: toStock(d.stock ?? ''),
  options: d.options,
})

export const toCreateInput = (
  f: ProductFields,
  images: DraftImage[],
  variants: VariantDraft[],
  status: 'DRAFT' | 'ACTIVE',
): CreateProductInput => {
  const production = parseProductionDays(f.availability)
  return {
    name: f.name.trim(),
    status,
    description: f.description || undefined,
    shortDescription: f.shortDescription.trim() || undefined,
    brand: f.brand.trim() || undefined,
    tags: parseTags(f.tags),
    categoryIds: f.categoryIds,
    images: images.map((img, i) => ({ uploadId: img.uploadId, alt: img.alt.trim() || undefined, position: i })),
    variants: variants.map((v, i) => toVariantInput(v, f.name, i)),
    seoTitle: f.seoTitle.trim() || undefined,
    seoDescription: f.seoDescription.trim() || undefined,
    isFeatured: f.isFeatured,
    stockPolicy: f.availability.stockPolicy,
    productionDays: production.ok ? production.days : null,
  }
}

/** Duplicar: mesmo cadastro, SKUs novos (sugeridos), estoque zerado, mesmas fotos. */
export const draftForDuplicate = (
  p: Product,
): { fields: ProductFields; images: DraftImage[]; hasOptions: boolean; options: OptionDraft[]; variants: VariantDraft[]; base: VariantDraft } => {
  const fields = { ...fieldsFromProduct(p), name: `${p.name} (cópia)`, isFeatured: false }
  const images = p.images.map((img) => ({ ...imageFromProduct(img), variantId: null }))
  const copy = (v: Variant): VariantDraft => ({ ...variantFromServer(v), sku: '', stock: '' })

  if (!hasRealOptions(p.variants)) {
    const first = p.variants[0]
    const base = first ? { ...copy(first), key: 'default', options: [] } : emptyVariant()
    return { fields, images, hasOptions: false, options: [], variants: [], base }
  }

  const options: OptionDraft[] = []
  for (const v of p.variants) {
    for (const o of v.options) {
      let opt = options.find((x) => x.name === o.option)
      if (!opt) {
        opt = { id: `dup-${options.length}`, name: o.option, values: [] }
        options.push(opt)
      }
      if (!opt.values.includes(o.value)) opt.values.push(o.value)
    }
  }
  const variants = p.variants.map((v) => ({ ...copy(v), key: optionKey(v.options) }))
  const base = variants[0] ? { ...variants[0], key: 'default', options: [] } : emptyVariant()
  return { fields, images, hasOptions: true, options, variants, base }
}

// ── Validação ────────────────────────────────────────────────────────────────

type ValidateInput = {
  fields: ProductFields
  images: DraftImage[]
  /** As variações a conferir (na edição, só as alteradas). */
  variants: VariantDraft[]
  /** Todas as do produto — para SKU repetido e regras de publicação. */
  allVariants?: VariantDraft[]
  publishing: boolean
  /** Na criação, SKU vazio usa a sugestão; na edição, vazio é erro. */
  skuFallback: boolean
}

/**
 * Espelha as regras da API (o Zod do contrato e o publishBlockers) para o erro
 * aparecer NO CAMPO, antes do round-trip. A API continua sendo a barreira.
 */
export const validateProduct = ({
  fields,
  images,
  variants,
  allVariants = variants,
  publishing,
  skuFallback,
}: ValidateInput): FieldErrors => {
  const errors: FieldErrors = {}
  if (!fields.name.trim()) errors.name = 'Informe o nome do produto.'

  const production = parseProductionDays(fields.availability)
  if (!production.ok) errors.productionDays = production.message

  const skuOf = (v: VariantDraft) => (skuFallback ? resolvedSku(v, fields.name) : v.sku.trim())
  const skuCount = new Map<string, number>()
  for (const v of allVariants) {
    const sku = skuOf(v).toLowerCase()
    if (sku) skuCount.set(sku, (skuCount.get(sku) ?? 0) + 1)
  }

  for (const v of variants) {
    const at = (field: string) => variantField(v.key, field)
    const sku = skuOf(v)
    if (!sku) errors[at('sku')] = 'Informe o SKU.'
    else if (sku.length > 80) errors[at('sku')] = 'Máximo de 80 caracteres.'
    else if ((skuCount.get(sku.toLowerCase()) ?? 0) > 1) errors[at('sku')] = 'SKU repetido em outra variação.'
    // Peso e medidas são exigidos até no rascunho: sem eles o frete não cota.
    if (toGrams(v.weight) <= 0) errors[at('weight')] = 'Informe o peso.'
    for (const dim of ['length', 'width', 'height'] as const) {
      if (cmToMm(v[dim]) <= 0) errors[at(dim)] = 'Informe a medida.'
    }
    if (publishing && v.isActive && v.price <= 0) errors[at('price')] = 'Informe o preço para publicar.'
  }

  if (publishing) {
    if (images.length === 0) errors.images = BLOCKER_MESSAGES.NO_IMAGE
    if (!allVariants.some((v) => v.isActive)) errors.variants = BLOCKER_MESSAGES.NO_ACTIVE_VARIANT
  }
  return errors
}

/** Opções da criação: nome e ao menos um valor, sem nome repetido, grid dentro do limite. */
export const validateOptions = (options: OptionDraft[]): FieldErrors => {
  const errors: FieldErrors = {}
  const specs = optionSpecs(options)
  if (specs.length === 0) {
    errors.options = 'Defina ao menos uma opção com valores (ex.: Cor: Verde, Azul).'
    return errors
  }
  const names = specs.map((s) => s.name.toLowerCase())
  if (new Set(names).size !== names.length) errors.options = 'Duas opções com o mesmo nome.'
  for (const o of options) {
    if (o.name.trim() && o.values.length === 0) errors[`option:${o.id}`] = 'Adicione ao menos um valor.'
    if (!o.name.trim() && o.values.length > 0) errors[`option:${o.id}`] = 'Dê um nome à opção.'
  }
  const total = cartesian(specs).length
  if (total > MAX_VARIANTS) errors.options = `São ${total} combinações; o limite é ${MAX_VARIANTS}.`
  return errors
}

// ── Checklist de publicação ──────────────────────────────────────────────────

export type ChecklistItem = { label: string; ok: boolean }

export const publishChecklist = (
  fields: ProductFields,
  imageCount: number,
  variants: VariantDraft[],
): ChecklistItem[] => {
  const blockers = publishBlockers({
    imageCount,
    variants: variants.map((v) => ({
      isActive: v.isActive,
      price: v.price,
      weight: toGrams(v.weight),
      length: cmToMm(v.length),
      width: cmToMm(v.width),
      height: cmToMm(v.height),
    })),
  })
  const noActive = blockers.includes('NO_ACTIVE_VARIANT')
  const items: ChecklistItem[] = [
    { label: 'Nome', ok: fields.name.trim() !== '' },
    { label: 'Ao menos uma foto', ok: !blockers.includes('NO_IMAGE') },
    { label: 'Preço em toda variação ativa', ok: !noActive && !blockers.includes('VARIANT_WITHOUT_PRICE') },
    {
      label: 'Peso e medidas (frete)',
      ok: !noActive && !blockers.includes('VARIANT_WITHOUT_WEIGHT') && !blockers.includes('VARIANT_WITHOUT_DIMENSIONS'),
    },
  ]
  if (fields.availability.stockPolicy !== 'STOCK_ONLY') {
    items.push({ label: 'Prazo de produção', ok: parseProductionDays(fields.availability).ok })
  }
  return items
}

// ── Erros da API ─────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  description: 'Descrição',
  shortDescription: 'Descrição curta',
  brand: 'Marca',
  tags: 'Tags',
  seoTitle: 'Título SEO',
  seoDescription: 'Descrição SEO',
  productionDays: 'Prazo de produção',
  categoryIds: 'Categorias',
  images: 'Fotos',
  variants: 'Variações',
  sku: 'SKU',
  price: 'Preço',
  compareAtPrice: 'Preço "de"',
  weight: 'Peso',
  length: 'Comprimento',
  width: 'Largura',
  height: 'Altura',
  initialStock: 'Estoque',
}

const fieldLabel = (path: string): string => {
  const variant = /^variants\.(\d+)\.(\w+)/.exec(path)
  if (variant) return `Variação ${Number(variant[1]) + 1} · ${FIELD_LABELS[variant[2]!] ?? variant[2]}`
  const head = path.split('.')[0] ?? path
  return FIELD_LABELS[head] ?? head
}

/** A mensagem para o lojista. Na 422 do Zod, os `details` — o "Dados inválidos" sozinho não diz nada. */
export const describeApiError = (e: unknown, fallback = 'Não foi possível salvar.'): string => {
  // fetch sem resposta (rede caiu, API fora do ar) é TypeError, não ApiError.
  if (e instanceof TypeError) return 'Sem conexão com o servidor. Confira a internet e tente de novo.'
  if (!(e instanceof ApiError)) return fallback
  if (e.code === ERROR_CODES.VALIDATION_ERROR && e.details?.length) {
    const lines = e.details.slice(0, 3).map((d) => `${fieldLabel(d.field)}: ${d.message}`)
    const more = e.details.length > 3 ? ` (e mais ${e.details.length - 3})` : ''
    return `${lines.join(' · ')}${more}`
  }
  return e.message
}

/** Os erros da API nos campos da tela. `variants` é a ordem enviada na criação. */
export const apiFieldErrors = (e: unknown, variants: VariantDraft[], name: string): FieldErrors => {
  const errors: FieldErrors = {}
  if (!(e instanceof ApiError)) return errors
  for (const d of e.details ?? []) {
    const variant = /^variants\.(\d+)\.(\w+)/.exec(d.field)
    const target = variant ? variants[Number(variant[1])] : undefined
    if (variant && target) errors[variantField(target.key, variant[2]!)] = d.message
    else errors[d.field.split('.')[0] ?? d.field] = d.message
  }
  if (e.code === ERROR_CODES.PRODUCTION_DAYS_REQUIRED) errors.productionDays = e.message
  // 409 do SKU: a mensagem nomeia o SKU, e ele aponta a variação.
  const sku = /SKU (\S+) já/.exec(e.message)?.[1]
  const owner = sku ? variants.find((v) => resolvedSku(v, name) === sku || v.sku.trim() === sku) : undefined
  if (owner) errors[variantField(owner.key, 'sku')] = 'Este SKU já é usado por outro produto.'
  return errors
}

/** Rola até o primeiro campo com erro (marcado com `data-invalid`). */
export const scrollToFirstError = (): void => {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>('[data-invalid="true"]')
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // A marca fica na mensagem de erro, ao lado do campo: o foco vai para o campo do mesmo grupo.
    const fields = 'input, textarea, select, [contenteditable="true"]'
    const input = el.matches(fields) ? el : el.parentElement?.querySelector<HTMLElement>(fields)
    input?.focus({ preventScroll: true })
  })
}

export type { ProductStatus }
