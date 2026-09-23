import { z } from 'zod'

/**
 * Formato HTTP das categorias. O admin valida os formulários com estes mesmos
 * schemas — mudar um campo aqui quebra o build do front no mesmo commit.
 */

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Informe o nome').max(120).trim(),
  // Sem `slug` na criação: nasce do nome, no backend. Só a edição aceita trocá-lo.
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
// `slug` aqui é o texto que o lojista digitou; o backend normaliza (slugify) e
// recusa colisão em vez de sufixar — quem escolheu o endereço quer ESSE endereço.
export const updateCategorySchema = createCategorySchema.partial().extend({
  slug: z.string().trim().min(1, 'Informe o endereço').max(160).optional(),
})
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
 *
 * `productCount` é a contagem de produtos NÃO arquivados vinculados a ESTA
 * categoria (não soma os filhos) — o admin mostra "(12)" ao lado do nome.
 */
export type CategoryTreeNode = Category & { productCount: number; children: CategoryTreeNode[] }

// z.lazy para o tipo recursivo.
export const categoryTreeNodeSchema: z.ZodType<CategoryTreeNode> = categorySchema.extend({
  productCount: z.number().int().nonnegative(),
  children: z.lazy(() => z.array(categoryTreeNodeSchema)),
})

/** Contagem de produtos por categoria — o admin mostra "(12)" ao lado do nome. */
export const categoryWithCountSchema = categorySchema.extend({
  productCount: z.number().int().nonnegative(),
})
export type CategoryWithCount = z.infer<typeof categoryWithCountSchema>
