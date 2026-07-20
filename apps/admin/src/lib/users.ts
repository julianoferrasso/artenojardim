import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type {
  StaffUser,
  StaffUserStatus,
  CreateStaffUserInput,
  UpdateStaffUserInput,
  ResetStaffPasswordInput,
} from '@ecommerce/shared/contracts'
import type { UserRole } from '@ecommerce/shared/constants'
import { apiFetch, apiFetchPaginated } from './api'

const KEY = ['staff-users']

export type StaffUserListParams = {
  q?: string | undefined
  role?: UserRole | undefined
  status?: StaffUserStatus | undefined
  sort?: string | undefined
  page?: number | undefined
}

export const useStaffUsers = (params: StaffUserListParams) =>
  useQuery({
    // Os params inteiros entram na key: trocar filtro é outra query, não a mesma
    // com dados velhos.
    queryKey: [...KEY, params],
    queryFn: () => {
      const search = new URLSearchParams()
      if (params.q) search.set('q', params.q)
      if (params.role) search.set('role', params.role)
      if (params.status) search.set('status', params.status)
      if (params.sort) search.set('sort', params.sort)
      if (params.page) search.set('page', String(params.page))

      const qs = search.toString()
      return apiFetchPaginated<StaffUser>(`${ROUTES.admin.users.list}${qs ? `?${qs}` : ''}`)
    },
  })

/** Toda mutação invalida a lista inteira — são poucos usuários, não vale granular. */
const useInvalidateStaffUsers = () => {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: KEY })
}

export const useCreateStaffUser = () => {
  const invalidate = useInvalidateStaffUsers()
  return useMutation({
    mutationFn: (input: CreateStaffUserInput) =>
      apiFetch<StaffUser>(ROUTES.admin.users.create, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  })
}

export const useUpdateStaffUser = () => {
  const invalidate = useInvalidateStaffUsers()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStaffUserInput }) =>
      apiFetch<StaffUser>(ROUTES.admin.users.update(id), {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  })
}

export const useDeactivateStaffUser = () => {
  const invalidate = useInvalidateStaffUsers()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<StaffUser>(ROUTES.admin.users.deactivate(id), { method: 'POST' }),
    onSuccess: invalidate,
  })
}

export const useReactivateStaffUser = () => {
  const invalidate = useInvalidateStaffUsers()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<StaffUser>(ROUTES.admin.users.reactivate(id), { method: 'POST' }),
    onSuccess: invalidate,
  })
}

export const useResetStaffPassword = () => {
  const invalidate = useInvalidateStaffUsers()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResetStaffPasswordInput }) =>
      apiFetch<void>(ROUTES.admin.users.password(id), {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  })
}

export const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  STAFF: 'Operador',
}

/** O que cada cargo pode fazer, em uma linha — mostrado abaixo do seletor. */
export const ROLE_HINT: Record<UserRole, string> = {
  OWNER: 'Acesso total, incluindo gerenciar outros proprietários.',
  ADMIN: 'Gerencia a loja e cadastra usuários, exceto proprietários.',
  STAFF: 'Opera pedidos, produtos e estoque. Não gerencia usuários.',
}
