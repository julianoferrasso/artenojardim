import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type {
  Product,
  ProductListItem,
  CreateProductInput,
  UpdateProductInput,
  UpdateVariantInput,
} from '@ecommerce/shared/contracts'
import { apiFetch, apiFetchPaginated } from './api'

export const useProducts = (params: { status?: string; q?: string; page?: number }) =>
  useQuery({
    queryKey: ['products', params],
    queryFn: () => {
      const qs = new URLSearchParams()
      qs.set('page', String(params.page ?? 1))
      qs.set('perPage', '24')
      if (params.status) qs.set('status', params.status)
      if (params.q) qs.set('q', params.q)
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

export const useDeleteProduct = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(ROUTES.products.remove(id), { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}
