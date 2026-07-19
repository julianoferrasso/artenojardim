import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type {
  Product,
  ProductListItem,
  CreateProductInput,
  UpdateProductInput,
  UpdateProductImagesInput,
  CreateVariantInput,
  UpdateVariantInput,
} from '@ecommerce/shared/contracts'
import { apiFetch, apiFetchPaginated } from './api'

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

export const useDeleteProduct = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(ROUTES.products.remove(id), { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}
