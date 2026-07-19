import { Prisma } from '@prisma/client'
import type {
  Product,
  ProductImage,
  Variant,
  ProductListItem,
} from '@ecommerce/shared/contracts'
import { storage } from '../../integrations/storage/index.js'

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
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  categories: { select: { categoryId: true } },
  images: {
    orderBy: { position: 'asc' },
    select: { id: true, uploadId: true, alt: true, position: true, upload: { select: { key: true } } },
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
})

const toVariant = (v: ProductRow['variants'][number]): Variant => ({
  id: v.id,
  sku: v.sku,
  barcode: v.barcode,
  price: v.price,
  compareAtPrice: v.compareAtPrice,
  costPrice: v.costPrice,
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
})

const priceRange = (variants: Variant[]): { min: number; max: number } => {
  const prices = variants.filter((v) => v.isActive).map((v) => v.price)
  if (prices.length === 0) return { min: 0, max: 0 }
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

export const toProductDTO = (row: ProductRow): Product => {
  const variants = row.variants.map(toVariant)
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
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    categoryIds: row.categories.map((c) => c.categoryId),
    images: row.images.map(toImage),
    variants,
    priceRange: priceRange(variants),
  }
}

// ── Listagem enxuta ───────────────────────────────────────────────────────────

export const LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  updatedAt: true,
  images: {
    orderBy: { position: 'asc' },
    take: 1,
    select: { upload: { select: { key: true } } },
  },
  variants: {
    where: { isActive: true },
    select: { price: true },
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
    updatedAt: row.updatedAt.toISOString(),
  }
}
