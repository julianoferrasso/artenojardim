import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type { AdminTheme, UpdateStoreThemeInput } from '@ecommerce/shared/contracts'
import { apiFetch } from './api'

const KEY = ['store', 'theme']

export const useStoreTheme = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<AdminTheme>(ROUTES.admin.storeTheme),
  })

export const useUpdateStoreTheme = () => {
  const qc = useQueryClient()
  return useMutation({
    // PUT e não PATCH: o tema é um documento único e o form manda tudo sempre.
    mutationFn: (input: UpdateStoreThemeInput) =>
      apiFetch<AdminTheme>(ROUTES.admin.storeTheme, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}
