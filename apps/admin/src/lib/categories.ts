import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type {
  Category,
  CategoryTreeNode,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@ecommerce/shared/contracts'
import { apiFetch } from './api'

const KEY = ['categories', 'tree']

export const useCategoryTree = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<CategoryTreeNode[]>(ROUTES.categories.tree),
  })

export const useCreateCategory = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      apiFetch<Category>(ROUTES.categories.create, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useUpdateCategory = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) =>
      apiFetch<Category>(ROUTES.categories.update(id), {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useDeleteCategory = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(ROUTES.categories.remove(id), { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

/** `depth` indenta listas de checkbox; o `label` já vem indentado para o <select>. */
type FlatCategory = { id: string; label: string; name: string; slug: string; isActive: boolean; depth: number }

/** Achata a árvore em opções indentadas para o <select> de "categoria pai".
 *  Exclui a própria categoria e suas descendentes — mover para dentro de si é
 *  ciclo, e a API rejeita, mas some da lista para nem tentar. */
export const flattenForSelect = (
  tree: CategoryTreeNode[],
  excludeId?: string,
  depth = 0,
): FlatCategory[] => {
  const out: FlatCategory[] = []
  for (const node of tree) {
    if (node.id === excludeId) continue // pula a subárvore inteira
    out.push({ id: node.id, slug: node.slug, isActive: node.isActive, name: node.name, depth, label:`${'  '.repeat(depth)}${node.name}` })
    out.push(...flattenForSelect(node.children, excludeId, depth + 1))
  }
  return out
}
