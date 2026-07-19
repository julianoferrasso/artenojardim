import {
  ERROR_CODES,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type Category,
  type CategoryTreeNode,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { appError, notFound, conflict } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit, diff, type AuditContext } from '../../shared/audit.js'
import { storage } from '../../integrations/storage/index.js'
import { slugify, uniqueSlug } from '../../utils/slug.js'
import { buildTree, wouldCreateCycle } from './domain/tree.js'

const SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  parentId: true,
  imageId: true,
  position: true,
  isActive: true,
  seoTitle: true,
  seoDescription: true,
  createdAt: true,
  updatedAt: true,
  image: { select: { key: true } },
} satisfies Prisma.CategorySelect

type Row = Prisma.CategoryGetPayload<{ select: typeof SELECT }>

const toDTO = (row: Row): Category => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  description: row.description,
  parentId: row.parentId,
  imageId: row.imageId,
  imageUrl: row.image ? storage().getPublicUrl(row.image.key) : null,
  position: row.position,
  isActive: row.isActive,
  seoTitle: row.seoTitle,
  seoDescription: row.seoDescription,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

const listAll = async (): Promise<Category[]> => {
  const rows = await prisma.category.findMany({
    where: { storeId: getActiveStoreId() },
    select: SELECT,
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
  })
  return rows.map(toDTO)
}

export const getCategoryTree = async (): Promise<CategoryTreeNode[]> =>
  buildTree(await listAll())

export const listCategories = listAll

export const getCategory = async (id: string): Promise<Category> => {
  const row = await prisma.category.findFirst({
    where: { id, storeId: getActiveStoreId() },
    select: SELECT,
  })
  if (!row) throw notFound('Categoria')
  return toDTO(row)
}

/** Slug único por loja, resolvido no service (nunca confia no que o front manda). */
const resolveSlug = async (base: string, excludeId?: string): Promise<string> => {
  const rows = await prisma.category.findMany({
    where: {
      storeId: getActiveStoreId(),
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { slug: true },
  })
  return uniqueSlug(base, new Set(rows.map((r) => r.slug)))
}

/** Um parentId informado tem que existir E ser da mesma loja. */
const assertParentValid = async (parentId: string): Promise<void> => {
  const parent = await prisma.category.findFirst({
    where: { id: parentId, storeId: getActiveStoreId() },
    select: { id: true },
  })
  if (!parent) throw appError(ERROR_CODES.VALIDATION_ERROR, 'Categoria pai não encontrada', 422)
}

export const createCategory = async (
  input: CreateCategoryInput,
  ctx: AuditContext,
): Promise<Category> => {
  const storeId = getActiveStoreId()

  if (input.parentId) await assertParentValid(input.parentId)

  const slug = await resolveSlug(input.slug ? slugify(input.slug) : slugify(input.name))

  const row = await prisma.category.create({
    data: {
      storeId,
      name: input.name,
      slug,
      description: input.description ?? null,
      parentId: input.parentId ?? null,
      imageId: input.imageId ?? null,
      position: input.position ?? 0,
      isActive: input.isActive ?? true,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
    },
    select: SELECT,
  })

  await audit({
    action: EVENTS.category.created,
    entityType: 'Category',
    entityId: row.id,
    changes: { name: { from: null, to: row.name }, slug: { from: null, to: row.slug } },
    context: ctx,
  })

  return toDTO(row)
}

export const updateCategory = async (
  id: string,
  input: UpdateCategoryInput,
  ctx: AuditContext,
): Promise<Category> => {
  const storeId = getActiveStoreId()

  const current = await prisma.category.findFirst({
    where: { id, storeId },
    select: SELECT,
  })
  if (!current) throw notFound('Categoria')

  // Mudança de pai: validar existência E ausência de ciclo. Sem a checagem de
  // ciclo, mover uma categoria para debaixo da própria descendente cria uma
  // árvore que se morde — e a query recursiva que a monta entra em loop.
  if (input.parentId !== undefined && input.parentId !== current.parentId) {
    if (input.parentId) {
      await assertParentValid(input.parentId)

      const all = await prisma.category.findMany({
        where: { storeId },
        select: { id: true, parentId: true },
      })
      const parentOf = new Map(all.map((c) => [c.id, c.parentId]))

      if (wouldCreateCycle(id, input.parentId, parentOf)) {
        throw appError(
          ERROR_CODES.VALIDATION_ERROR,
          'Não é possível mover uma categoria para dentro de uma subcategoria dela mesma',
          422,
        )
      }
    }
  }

  const nextSlug =
    input.slug !== undefined ? await resolveSlug(slugify(input.slug), id) : undefined

  const data: Prisma.CategoryUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (nextSlug !== undefined) data.slug = nextSlug
  if (input.description !== undefined) data.description = input.description
  if (input.parentId !== undefined) data.parent = input.parentId
    ? { connect: { id: input.parentId } }
    : { disconnect: true }
  if (input.imageId !== undefined) data.image = input.imageId
    ? { connect: { id: input.imageId } }
    : { disconnect: true }
  if (input.position !== undefined) data.position = input.position
  if (input.isActive !== undefined) data.isActive = input.isActive
  if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle
  if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription

  const row = await prisma.category.update({ where: { id }, data, select: SELECT })

  const changes = diff(
    {
      name: current.name,
      slug: current.slug,
      parentId: current.parentId,
      isActive: current.isActive,
      position: current.position,
    },
    {
      name: row.name,
      slug: row.slug,
      parentId: row.parentId,
      isActive: row.isActive,
      position: row.position,
    },
  )

  // Só audita se algo mudou de fato — salvar o form sem tocar em nada não vira log.
  if (Object.keys(changes).length > 0) {
    await audit({
      action: EVENTS.category.updated,
      entityType: 'Category',
      entityId: id,
      changes,
      context: ctx,
    })
  }

  return toDTO(row)
}

export const deleteCategory = async (id: string, ctx: AuditContext): Promise<void> => {
  const storeId = getActiveStoreId()

  const category = await prisma.category.findFirst({
    where: { id, storeId },
    select: { id: true, name: true, _count: { select: { children: true } } },
  })
  if (!category) throw notFound('Categoria')

  // Bloqueia antes de tentar, para dar mensagem clara em vez do erro cru de FK.
  // A regra é do negócio: apagar um galho não pode orfanar as folhas em silêncio.
  if (category._count.children > 0) {
    throw conflict(
      'Esta categoria tem subcategorias. Mova ou exclua as subcategorias primeiro.',
      ERROR_CODES.CONFLICT,
    )
  }

  await prisma.category.delete({ where: { id } })

  await audit({
    action: EVENTS.category.deleted,
    entityType: 'Category',
    entityId: id,
    changes: { name: { from: category.name, to: null } },
    context: ctx,
  })
}
