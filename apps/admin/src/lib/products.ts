import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES, type ProductStatus } from '@ecommerce/shared/constants'
import type {
  Product,
  ProductListItem,
  CreateProductInput,
  UpdateProductInput,
  UpdateProductImagesInput,
  CreateVariantInput,
  UpdateVariantInput,
  InventoryLevel,
  RecordMovementInput,
} from '@ecommerce/shared/contracts'
import { apiFetch, apiFetchPaginated } from './api'
import { describeApiError } from './product-draft'

export const PRODUCT_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  ARCHIVED: 'Arquivado',
}

export const useProducts = (params: {
  status?: string
  q?: string
  page?: number
  sort?: string
}) =>
  useQuery({
    queryKey: ['products', params],
    queryFn: () => {
      const qs = new URLSearchParams()
      qs.set('page', String(params.page ?? 1))
      qs.set('perPage', '24')
      if (params.status) qs.set('status', params.status)
      if (params.q) qs.set('q', params.q)
      if (params.sort) qs.set('sort', params.sort)
      return apiFetchPaginated<ProductListItem>(`${ROUTES.products.list}?${qs}`)
    },
  })

export const useProduct = (id: string | undefined) =>
  useQuery({
    queryKey: ['product', id],
    enabled: !!id,
    queryFn: () => apiFetch<Product>(ROUTES.products.detail(id!)),
  })

export const useCreateProduct = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProductInput) =>
      apiFetch<Product>(ROUTES.products.create, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export const useUpdateProduct = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      apiFetch<Product>(ROUTES.products.update(id), { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product', id] })
    },
  })
}

export const useUpdateProductImages = (productId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (images: UpdateProductImagesInput['images']) =>
      apiFetch<Product>(ROUTES.products.images(productId), {
        method: 'PUT',
        body: JSON.stringify({ images }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product', productId] })
    },
  })
}

export const useUpdateVariant = (productId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: UpdateVariantInput }) =>
      apiFetch<Product>(ROUTES.products.variant(productId, variantId), {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product', productId] })
    },
  })
}

export const useAddVariant = (productId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateVariantInput) =>
      apiFetch<Product>(ROUTES.products.variants(productId), {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product', productId] })
    },
  })
}

export const useRemoveVariant = (productId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (variantId: string) =>
      apiFetch<Product>(ROUTES.products.variant(productId, variantId), { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product', productId] })
    },
  })
}

export type SavePlan = {
  product: UpdateProductInput | null
  images: UpdateProductImagesInput['images'] | null
  variants: Array<{ id: string; input: UpdateVariantInput | null; counted: number | null }>
  status: ProductStatus | null
}

export type SaveResult = {
  ok: boolean
  /** Erro de cada passo que falhou. `variants` fica em `variantErrors`, por id. */
  errors: { product?: string; images?: string; status?: string }
  variantErrors: Record<string, string>
  /** Quais variações gravaram — o rascunho delas pode ser descartado. */
  savedVariantIds: string[]
  product: Product | undefined
}

/**
 * O "Salvar" único da edição. A API tem uma rota por parte do produto; aqui elas
 * viram uma ação só, em sequência, e só com o que mudou. O status vai POR ÚLTIMO
 * e só se tudo antes deu certo: publicar valida o estado GRAVADO, e a foto nova
 * precisa estar no banco antes — senão "Publicar" dizia "adicione uma imagem"
 * com a imagem na tela.
 *
 * Nunca lança: cada passo guarda o próprio erro, e a tela mostra na seção certa.
 */
export const useSaveProductEdits = (productId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (plan: SavePlan): Promise<SaveResult> => {
      const result: SaveResult = { ok: true, errors: {}, variantErrors: {}, savedVariantIds: [], product: undefined }
      const fail = (e: unknown) => {
        result.ok = false
        return describeApiError(e, 'Falha ao salvar.')
      }

      if (plan.product) {
        try {
          result.product = await apiFetch<Product>(ROUTES.products.update(productId), {
            method: 'PATCH',
            body: JSON.stringify(plan.product),
          })
        } catch (e) {
          result.errors.product = fail(e)
        }
      }

      if (plan.images) {
        try {
          result.product = await apiFetch<Product>(ROUTES.products.images(productId), {
            method: 'PUT',
            body: JSON.stringify({ images: plan.images }),
          })
        } catch (e) {
          result.errors.images = fail(e)
        }
      }

      for (const v of plan.variants) {
        try {
          if (v.input) {
            result.product = await apiFetch<Product>(ROUTES.products.variant(productId, v.id), {
              method: 'PATCH',
              body: JSON.stringify(v.input),
            })
          }
          // Estoque nunca vai no update da variante: vira uma CONTAGEM no razão, e o
          // backend grava a diferença para o saldo atual (mesmo fluxo da tela Estoque).
          if (v.counted !== null) {
            await apiFetch<InventoryLevel>(ROUTES.inventory.movements, {
              method: 'POST',
              body: JSON.stringify({
                variantId: v.id,
                type: 'COUNT',
                counted: v.counted,
                reason: 'Ajuste na edição do produto',
              } satisfies RecordMovementInput),
            })
          }
          result.savedVariantIds.push(v.id)
        } catch (e) {
          result.variantErrors[v.id] = fail(e)
        }
      }

      if (plan.status && result.ok) {
        try {
          result.product = await apiFetch<Product>(ROUTES.products.update(productId), {
            method: 'PATCH',
            body: JSON.stringify({ status: plan.status } satisfies UpdateProductInput),
          })
        } catch (e) {
          result.errors.status = fail(e)
        }
      }

      if (result.product) qc.setQueryData(['product', productId], result.product)
      return result
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['products'] }),
        qc.invalidateQueries({ queryKey: ['product', productId] }),
        qc.invalidateQueries({ queryKey: ['inventory'] }),
      ]),
  })
}

export const useDeleteProduct = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(ROUTES.products.remove(id), { method: 'DELETE' }),
    onSuccess: (_, id) => {
      // O detalhe em cache apontaria para um produto que não existe mais.
      qc.removeQueries({ queryKey: ['product', id] })
      return qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
