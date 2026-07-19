import {
  ERROR_CODES,
  type CreateProductInput,
  type UpdateProductInput,
  type CreateVariantInput,
  type Product,
  type ProductListItem,
  type ProductListQuery,
  type PaginationMeta,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { appError, notFound, businessError } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit, diff, type AuditContext } from '../../shared/audit.js'
import { slugify, uniqueSlug } from '../../utils/slug.js'
import { deriveOptions, validateVariants } from './domain/variants.js'
import { publishBlockers, BLOCKER_MESSAGES } from './domain/publish.js'
import { PRODUCT_SELECT, LIST_SELECT, toProductDTO, toListItem } from './repository.js'

const DEFAULT_OPTION_VALUE = 'Default Title'

const resolveSlug = async (base: string, excludeId?: string): Promise<string> => {
  const rows = await prisma.product.findMany({
    where: { storeId: getActiveStoreId(), ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { slug: true },
  })
  return uniqueSlug(base, new Set(rows.map((r) => r.slug)))
}

/** Traduz os erros de domínio de variante em AppError com mensagem legível. */
const assertVariantsValid = (variants: CreateVariantInput[]): void => {
  const errors = validateVariants(variants)
  if (errors.length === 0) return

  const first = errors[0]!
  const message =
    first.code === 'DUPLICATE_SKU'
      ? `SKU repetido entre as variações: ${first.sku}`
      : first.code === 'DUPLICATE_OPTIONS'
        ? 'Duas variações têm a mesma combinação de opções'
        : 'Todas as variações devem usar o mesmo conjunto de opções'
  throw appError(ERROR_CODES.VALIDATION_ERROR, message, 422)
}

/** Categorias informadas existem e são da mesma loja? */
const assertCategoriesValid = async (categoryIds: string[]): Promise<void> => {
  if (categoryIds.length === 0) return
  const count = await prisma.category.count({
    where: { id: { in: categoryIds }, storeId: getActiveStoreId() },
  })
  if (count !== categoryIds.length) {
    throw appError(ERROR_CODES.VALIDATION_ERROR, 'Uma ou mais categorias não existem', 422)
  }
}

/**
 * Constrói o `data` aninhado de criação de variantes + suas opções.
 *
 * As ProductOption/OptionValue são DERIVADAS das variantes (a fonte da verdade),
 * criadas uma vez, e cada variante conecta seus valores. Um produto sem opções
 * ganha uma opção implícita "Default Title" — é o que faz TODO produto ter
 * variante uniforme, eliminando o `if (hasVariants)` do resto do sistema.
 */
type OptionValueIds = Map<string, string> // "Cor=Verde" -> optionValueId

const createProductGraph = async (
  tx: Prisma.TransactionClient,
  storeId: string,
  productId: string,
  variants: CreateVariantInput[],
): Promise<void> => {
  const hasOptions = variants.some((v) => v.options.length > 0)
  const valueIds: OptionValueIds = new Map()

  if (hasOptions) {
    const specs = deriveOptions(variants)

    // Uma query por opção (poucas), depois createMany para todos os valores de
    // uma vez, e um findMany para recuperar os ids. Antes era uma query POR
    // valor em série: com a latência do túnel, estourava o timeout de 5s da
    // transação. Agrupar corta os round-trips de ~N para ~3.
    for (const [optIndex, spec] of specs.entries()) {
      const option = await tx.productOption.create({
        data: { productId, name: spec.name, position: optIndex },
        select: { id: true },
      })
      await tx.productOptionValue.createMany({
        data: spec.values.map((value, valIndex) => ({
          optionId: option.id,
          value,
          position: valIndex,
        })),
      })
      const created = await tx.productOptionValue.findMany({
        where: { optionId: option.id },
        select: { id: true, value: true },
      })
      for (const ov of created) valueIds.set(`${spec.name}=${ov.value}`, ov.id)
    }
  }

  for (const [index, v] of variants.entries()) {
    // optionValues fica FORA do literal quando não há opções: com
    // exactOptionalPropertyTypes, passar `undefined` explícito é erro — a chave
    // tem que estar ausente, não presente-e-undefined.
    const optionValues = hasOptions
      ? {
          create: v.options.map((o) => {
            const id = valueIds.get(`${o.option}=${o.value}`)
            if (!id) throw new Error(`optionValue ausente: ${o.option}=${o.value}`)
            return { optionValueId: id }
          }),
        }
      : undefined

    await tx.productVariant.create({
      data: {
        storeId,
        productId,
        sku: v.sku,
        barcode: v.barcode ?? null,
        price: v.price,
        compareAtPrice: v.compareAtPrice ?? null,
        costPrice: v.costPrice ?? null,
        weight: v.weight,
        length: v.length,
        width: v.width,
        height: v.height,
        position: v.position || index,
        isActive: v.isActive,
        imageId: v.imageId ?? null,
        ...(optionValues ? { optionValues } : {}),
      },
    })
  }
}

export const createProduct = async (
  input: CreateProductInput,
  ctx: AuditContext,
): Promise<Product> => {
  const storeId = getActiveStoreId()

  assertVariantsValid(input.variants)
  await assertCategoriesValid(input.categoryIds)

  // Publicar já na criação exige produto completo. DRAFT pode estar incompleto.
  if (input.status === 'ACTIVE') assertPublishable(input.images.length, input.variants)

  const slug = await resolveSlug(input.slug ? slugify(input.slug) : slugify(input.name))

  // Transação: produto + opções + variantes + imagens + categorias nascem juntos.
  // Se qualquer passo falhar, nada fica — nunca um produto órfão sem variante.
  const created = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        storeId,
        name: input.name,
        slug,
        description: input.description ?? null,
        shortDescription: input.shortDescription ?? null,
        status: input.status,
        brand: input.brand ?? null,
        tags: input.tags,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        publishedAt: input.status === 'ACTIVE' ? new Date() : null,
        categories: { create: input.categoryIds.map((categoryId) => ({ categoryId })) },
        images: {
          create: input.images.map((img, i) => ({
            uploadId: img.uploadId,
            alt: img.alt ?? null,
            position: img.position || i,
          })),
        },
      },
      select: { id: true },
    })

    await createProductGraph(tx, storeId, product.id, normalizeVariants(input.variants))

    return tx.product.findUniqueOrThrow({ where: { id: product.id }, select: PRODUCT_SELECT })
    // timeout generoso: a criação faz N inserts de variante em série, e em dev
    // isso atravessa o túnel SSH. Em produção o banco é loopback e é instantâneo.
  }, { timeout: 20_000 })

  await audit({
    action: EVENTS.product.created,
    entityType: 'Product',
    entityId: created.id,
    changes: { name: { from: null, to: created.name }, status: { from: null, to: created.status } },
    context: ctx,
  })

  return toProductDTO(created)
}

/** Produto sem opções: injeta a opção implícita "Default Title" na variante. */
const normalizeVariants = (variants: CreateVariantInput[]): CreateVariantInput[] => {
  const hasOptions = variants.some((v) => v.options.length > 0)
  if (hasOptions) return variants
  return variants.map((v) => ({ ...v, options: [{ option: 'Título', value: DEFAULT_OPTION_VALUE }] }))
}

const assertPublishable = (imageCount: number, variants: CreateVariantInput[]): void => {
  const blockers = publishBlockers({
    imageCount,
    variants: variants.map((v) => ({ isActive: v.isActive, price: v.price, weight: v.weight })),
  })
  if (blockers.length > 0) {
    throw businessError(
      ERROR_CODES.PRODUCT_NOT_PUBLISHABLE,
      blockers.map((b) => BLOCKER_MESSAGES[b]).join(' '),
      422,
    )
  }
}

export const getProduct = async (
  idOrSlug: string,
  opts: { publicOnly: boolean },
): Promise<Product> => {
  const row = await prisma.product.findFirst({
    where: {
      storeId: getActiveStoreId(),
      deletedAt: null,
      // O público não pode ver DRAFT/ARCHIVED nem adivinhando o slug.
      ...(opts.publicOnly ? { status: 'ACTIVE' } : {}),
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    select: PRODUCT_SELECT,
  })
  if (!row) throw notFound('Produto')
  return toProductDTO(row)
}

export const listProducts = async (
  query: ProductListQuery,
  opts: { publicOnly: boolean },
): Promise<{ items: ProductListItem[]; meta: PaginationMeta }> => {
  const where: Prisma.ProductWhereInput = {
    storeId: getActiveStoreId(),
    deletedAt: null,
    // A vitrine pública só vê ACTIVE. O admin vê tudo (ou filtra por status).
    ...(opts.publicOnly ? { status: 'ACTIVE' } : query.status ? { status: query.status } : {}),
    ...(query.categoryId ? { categories: { some: { categoryId: query.categoryId } } } : {}),
    // unaccent + ILIKE simples: FTS entra na Fase 2 se o catálogo crescer.
    ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
    }),
    prisma.product.count({ where }),
  ])

  return {
    items: rows.map(toListItem),
    meta: {
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.ceil(total / query.perPage),
    },
  }
}

/**
 * Update de campos do produto (NÃO das variantes — que têm fluxo próprio, por
 * serem o dado mais sensível: preço e estoque). Publicar carrega a verificação
 * de regras contra o estado ATUAL no banco.
 */
export const updateProduct = async (
  id: string,
  input: UpdateProductInput,
  ctx: AuditContext,
): Promise<Product> => {
  const storeId = getActiveStoreId()

  const current = await prisma.product.findFirst({
    where: { id, storeId, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      _count: { select: { images: true } },
      variants: { select: { isActive: true, price: true, weight: true } },
    },
  })
  if (!current) throw notFound('Produto')

  if (input.categoryIds) await assertCategoriesValid(input.categoryIds)

  // Transição para ACTIVE: valida contra o estado real (imagens + variantes que
  // JÁ existem no banco), não contra o que o request manda.
  if (input.status === 'ACTIVE' && current.status !== 'ACTIVE') {
    const blockers = publishBlockers({
      imageCount: current._count.images,
      variants: current.variants,
    })
    if (blockers.length > 0) {
      throw businessError(
        ERROR_CODES.PRODUCT_NOT_PUBLISHABLE,
        blockers.map((b) => BLOCKER_MESSAGES[b]).join(' '),
        422,
      )
    }
  }

  const nextSlug = input.slug !== undefined ? await resolveSlug(slugify(input.slug), id) : undefined

  const data: Prisma.ProductUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (nextSlug !== undefined) data.slug = nextSlug
  if (input.description !== undefined) data.description = input.description
  if (input.shortDescription !== undefined) data.shortDescription = input.shortDescription
  if (input.brand !== undefined) data.brand = input.brand
  if (input.tags !== undefined) data.tags = input.tags
  if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle
  if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription
  if (input.status !== undefined) {
    data.status = input.status
    // Marca publishedAt na primeira vez que vira ACTIVE; não reescreve depois.
    if (input.status === 'ACTIVE' && current.status !== 'ACTIVE') data.publishedAt = new Date()
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.categoryIds) {
      await tx.productCategory.deleteMany({ where: { productId: id } })
      await tx.productCategory.createMany({
        data: input.categoryIds.map((categoryId) => ({ productId: id, categoryId })),
      })
    }
    await tx.product.update({ where: { id }, data })
    return tx.product.findUniqueOrThrow({ where: { id }, select: PRODUCT_SELECT })
  })

  const changes = diff(
    { name: current.name, slug: current.slug, status: current.status },
    { name: updated.name, slug: updated.slug, status: updated.status },
  )
  if (Object.keys(changes).length > 0) {
    await audit({
      action: input.status && input.status !== current.status ? EVENTS.product.published : EVENTS.product.updated,
      entityType: 'Product',
      entityId: id,
      changes,
      context: ctx,
    })
  }

  return toProductDTO(updated)
}

/**
 * Soft delete: um produto com pedidos históricos vira ARCHIVED + deletedAt, não
 * some. O `deletedAt: null` em toda leitura o esconde da loja e do admin, mas o
 * OrderItem antigo continua com a referência intacta.
 */
export const deleteProduct = async (id: string, ctx: AuditContext): Promise<void> => {
  const product = await prisma.product.findFirst({
    where: { id, storeId: getActiveStoreId(), deletedAt: null },
    select: { id: true, name: true },
  })
  if (!product) throw notFound('Produto')

  await prisma.product.update({
    where: { id },
    data: { status: 'ARCHIVED', deletedAt: new Date() },
  })

  await audit({
    action: EVENTS.product.deleted,
    entityType: 'Product',
    entityId: id,
    changes: { name: { from: product.name, to: null } },
    context: ctx,
  })
}
