import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type { Banner, CreateBannerInput, UpdateBannerInput } from '@ecommerce/shared/contracts'
import { apiFetch } from './api'

const KEY = ['banners']

/** Staff logado recebe TODOS os banners (a rota é a mesma da loja pública). */
export const useBanners = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<Banner[]>(ROUTES.cms.banners),
  })

export const useCreateBanner = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBannerInput) =>
      apiFetch<Banner>(ROUTES.cms.banners, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useUpdateBanner = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateBannerInput }) =>
      apiFetch<Banner>(ROUTES.cms.banner(id), {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useDeleteBanner = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(ROUTES.cms.banner(id), { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
