import { z } from 'zod'
import { slugSchema } from './common.js'

/**
 * Formato HTTP das categorias. O admin valida os formulários com estes mesmos
 * schemas — mudar um campo aqui quebra o build do front no mesmo commit.
 */

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Informe o nome').max(120).trim(),
  // Slug opcional: se vazio, o backend gera a partir do nome. Nunca é o front
  // que decide o slug final — colisão é resolvida no service.
  slug: slugSchema.optional(),
  description: z.string().max(2000).optional(),
  parentId: z.string().nullable().optional(),
  imageId: z.string().nullable().optional(),
  position: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  seoTitle: z.string().max(160).optional(),
  seoDescription: z.string().max(320).optional(),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>

// partial(): no update todo campo é opcional, mas quando presente segue a mesma
// regra do create. Reusa a validação em vez de reescrevê-la.
export const updateCategorySchema = createCategorySchema.partial()
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>

/** Uma categoria, sem os filhos. */
export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  parentId: z.string().nullable(),
  imageId: z.string().nullable(),
  imageUrl: z.string().nullable(),
  position: z.number().int(),
  isActive: z.boolean(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Category = z.infer<typeof categorySchema>

/**
 * Nó da árvore: a categoria mais seus filhos, recursivo. A API monta a árvore
 * inteira em memória (adjacency list é barato nessa escala) e devolve pronta,
 * para o front não ter que reconstruir a hierarquia a partir de uma lista plana.
 */
export type CategoryTreeNode = Category & { children: CategoryTreeNode[] }

// z.lazy para o tipo recursivo.
export const categoryTreeNodeSchema: z.ZodType<CategoryTreeNode> = categorySchema.extend({
  children: z.lazy(() => z.array(categoryTreeNodeSchema)),
})

/** Contagem de produtos por categoria — o admin mostra "(12)" ao lado do nome. */
export const categoryWithCountSchema = categorySchema.extend({
  productCount: z.number().int().nonnegative(),
})
export type CategoryWithCount = z.infer<typeof categoryWithCountSchema>
