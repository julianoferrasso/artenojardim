import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type { StaffNotifications, UpdateStaffNotificationsInput } from '@ecommerce/shared/contracts'
import { apiFetch } from './api'

const KEY = ['store', 'notifications']

/** `enabled` existe porque a rota exige ADMIN: STAFF só tomaria 403. */
export const useStaffNotifications = (enabled: boolean) =>
  useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<StaffNotifications>(ROUTES.admin.storeNotifications),
    enabled,
  })

export const useUpdateStaffNotifications = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateStaffNotificationsInput) =>
      apiFetch<StaffNotifications>(ROUTES.admin.storeNotifications, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      qc.setQueryData(KEY, data)
      qc.invalidateQueries({ queryKey: KEY })
    },
  })
}

export const useTestStaffNotifications = () =>
  useMutation({
    mutationFn: () => apiFetch<{ to: string }>(ROUTES.admin.storeNotificationsTest, { method: 'POST' }),
  })
