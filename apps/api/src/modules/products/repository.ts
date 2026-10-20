import { Prisma } from '@prisma/client'
import type {
  Product,
  ProductImage,
  Variant,
  ProductListItem,
} from '@ecommerce/shared/contracts'
import { storage } from '../../integrations/storage/index.js'
import {
  aggregateAvailable,
  availableOf,
  lowStockRemainingOf,
  stockStatusOf,
} from '../inventory/domain/availability.js'

/**
 * repository.ts EXISTE aqui (ao contrário de categories) porque a query de
 * produto é complexa e reusada: o mesmo `select` aninhado de variantes, opções,
 * imagens e categorias serve o detail, o create-return e o update-return. Sem
 * centralizar, o `select` divergiria entre os três e um deles esqueceria um campo.
 */

export const PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  shortDescription: true,
  status: true,
  brand: true,
  tags: true,
  seoTitle: true,
  seoDescription: true,
  isFeatured: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  categories: { select: { categoryId: true } },
  images: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      uploadId: true,
      alt: true,
      position: true,
      variantId: true,
      // width/height alimentam a galeria: reservam a caixa (sem layout shift) e
      // limitam o zoom ao que o arquivo original aguenta.
      upload: { select: { key: true, width: true, height: true } },
    },
  },
  variants: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      sku: true,
      barcode: true,
      price: true,
      compareAtPrice: true,
      costPrice: true,
      weight: true,
      length: true,
      width: true,
      height: true,
      position: true,
      isActive: true,
      imageId: true,
      level: { select: { onHand: true, reserved: true } },
      optionValues: {
        select: {
          optionValue: {
            select: { value: true, option: { select: { name: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.ProductSelect

export type ProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>

const toImage = (img: ProductRow['images'][number]): ProductImage => ({
  id: img.id,
  uploadId: img.uploadId,
  url: storage().getPublicUrl(img.upload.key),
  alt: img.alt,
  position: img.position,
  variantId: img.variantId,
  width: img.upload.width,
  height: img.upload.height,
})

/** Quem pergunta: o público (a loja) ou o staff (o admin). Muda o que sai. */
type Audience = { publicOnly: boolean }

const toVariant = (v: ProductRow['variants'][number], { publicOnly }: Audience): Variant => {
  const available = availableOf(v.level)
  return {
    id: v.id,
    sku: v.sku,
    barcode: v.barcode,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    // Custo é margem da loja: nunca sai para quem não é staff.
    costPrice: publicOnly ? null : v.costPrice,
    weight: v.weight,
    length: v.length,
    width: v.width,
    height: v.height,
    position: v.position,
    isActive: v.isActive,
    imageId: v.imageId,
    options: v.optionValues.map((ov) => ({
      option: ov.optionValue.option.name,
      value: ov.optionValue.value,
    })),
    stockStatus: stockStatusOf(available),
    lowStockRemaining: lowStockRemainingOf(available),
  }
}

const priceRange = (variants: Variant[]): { min: number; max: number } => {
  const prices = variants.filter((v) => v.isActive).map((v) => v.price)
  if (prices.length === 0) return { min: 0, max: 0 }
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

/**
 * Para o público, só as variações à venda: as inativas são as aposentadas,
 * guardadas porque há pedido apontando para elas.
 */
export const toProductDTO = (row: ProductRow, audience: Audience): Product => {
  const rows = audience.publicOnly ? row.variants.filter((v) => v.isActive) : row.variants
  const variants = rows.map((v) => toVariant(v, audience))
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    shortDescription: row.shortDescription,
    status: row.status,
    brand: row.brand,
    tags: row.tags,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    isFeatured: row.isFeatured,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    categoryIds: row.categories.map((c) => c.categoryId),
    images: row.images.map(toImage),
    variants,
    priceRange: priceRange(variants),
    stockStatus: stockStatusOf(aggregateAvailable(rows.filter((v) => v.isActive).map((v) => v.level))),
  }
}

// ── Listagem enxuta ───────────────────────────────────────────────────────────

export const LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  isFeatured: true,
  updatedAt: true,
  // Capa do catálogo: a foto do PRODUTO (variantId null) vem primeiro. Sem o
  // desempate por variantId, a capa poderia virar a foto de uma variação
  // específica só por ela estar na position 0.
  images: {
    orderBy: [{ variantId: { sort: 'asc', nulls: 'first' } }, { position: 'asc' }],
    take: 1,
    select: { upload: { select: { key: true } } },
  },
  variants: {
    where: { isActive: true },
    select: { price: true, level: { select: { onHand: true, reserved: true } } },
  },
} satisfies Prisma.ProductSelect

export type ListRow = Prisma.ProductGetPayload<{ select: typeof LIST_SELECT }>

export const toListItem = (row: ListRow): ProductListItem => {
  const prices = row.variants.map((v) => v.price)
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    thumbnailUrl: row.images[0] ? storage().getPublicUrl(row.images[0].upload.key) : null,
    priceRange: {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    },
    variantCount: row.variants.length,
    isFeatured: row.isFeatured,
    updatedAt: row.updatedAt.toISOString(),
    stockStatus: stockStatusOf(aggregateAvailable(row.variants.map((v) => v.level))),
  }
}
