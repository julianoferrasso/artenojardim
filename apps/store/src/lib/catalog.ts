import 'server-only'
import { ROUTES } from '@ecommerce/shared/constants'
import type {
  Product,
  ProductListItem,
  CategoryTreeNode,
  PublicStore,
  PaginationMeta,
} from '@ecommerce/shared/contracts'
import { apiFetch, apiFetchPaginated } from './api'

/**
 * Camada de dados da loja — SÓ server-side (`server-only` faz o build falhar se
 * um Client Component importar isto). Chama a API pelo loopback e cacheia com
 * ISR: catálogo é público, muda pouco, e SEO exige HTML renderizado no servidor.
 *
 * revalidate 60s: o lojista que publica um produto espera até 1 minuto. Sem fila
 * de revalidação (arquitetura §2) — o TTL resolve 95% dos casos.
 */

const REVALIDATE = 60

export const getStore = (): Promise<PublicStore> =>
  apiFetch<PublicStore>(ROUTES.store, { revalidate: REVALIDATE, tags: ['store'] })

export const getCategoryTree = (): Promise<CategoryTreeNode[]> =>
  apiFetch<CategoryTreeNode[]>(ROUTES.categories.tree, {
    revalidate: REVALIDATE,
    tags: ['categories'],
  })

/** Lista pública (só ACTIVE — a API decide pela ausência de auth). */
export const listProducts = (params: {
  category?: string
  q?: string
  page?: number
}): Promise<{ data: ProductListItem[]; meta: PaginationMeta }> => {
  const qs = new URLSearchParams()
  qs.set('page', String(params.page ?? 1))
  qs.set('perPage', '24')
  if (params.category) qs.set('categoryId', params.category)
  if (params.q) qs.set('q', params.q)

  // Busca é dinâmica (query infinita, cache inútil); listagem por categoria cacheia.
  return apiFetchPaginated<ProductListItem>(
    `${ROUTES.products.list}?${qs}`,
    params.q ? { revalidate: false } : { revalidate: REVALIDATE, tags: ['products'] },
  )
}

export const getProduct = (slug: string): Promise<Product> =>
  apiFetch<Product>(ROUTES.products.detail(slug), { revalidate: REVALIDATE, tags: [`product:${slug}`] })
