import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type {
  AdminCustomer,
  AdminCustomerListItem,
  AdminCustomerStatus,
  AdminCustomerTriState,
  UpdateAdminCustomerInput,
} from '@ecommerce/shared/contracts'
import { apiFetch, apiFetchPaginated } from './api'

const KEY = ['customers']

export type CustomerListParams = {
  q?: string | undefined
  status?: AdminCustomerStatus | undefined
  verified?: AdminCustomerTriState | undefined
  marketing?: AdminCustomerTriState | undefined
  sort?: string | undefined
  page?: number | undefined
}

export const useCustomers = (params: CustomerListParams) =>
  useQuery({
    // Os params inteiros entram na key: trocar filtro é outra query.
    queryKey: [...KEY, params],
    queryFn: () => {
      const search = new URLSearchParams()
      if (params.q) search.set('q', params.q)
      if (params.status) search.set('status', params.status)
      if (params.verified) search.set('verified', params.verified)
      if (params.marketing) search.set('marketing', params.marketing)
      if (params.sort) search.set('sort', params.sort)
      if (params.page) search.set('page', String(params.page))

      const qs = search.toString()
      return apiFetchPaginated<AdminCustomerListItem>(
        `${ROUTES.admin.customers.list}${qs ? `?${qs}` : ''}`,
      )
    },
  })

export const useCustomer = (id: string) =>
  useQuery({
    queryKey: ['customer', id],
    queryFn: () => apiFetch<AdminCustomer>(ROUTES.admin.customers.detail(id)),
    enabled: !!id,
  })

/**
 * Semeia o detalhe com o que a mutação devolveu e invalida a lista: sem o
 * `setQueryData`, a tela pisca com o dado velho até o refetch chegar.
 */
const useCustomerMutation = <TInput>(
  id: string,
  request: (input: TInput) => Promise<AdminCustomer>,
) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: request,
    onSuccess: (customer) => {
      qc.setQueryData(['customer', id], customer)
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: ['customer', id] })
    },
  })
}

export const useUpdateCustomer = (id: string) =>
  useCustomerMutation<UpdateAdminCustomerInput>(id, (input) =>
    apiFetch<AdminCustomer>(ROUTES.admin.customers.update(id), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  )

export const useAnonymizeCustomer = (id: string) =>
  useCustomerMutation<void>(id, () =>
    apiFetch<AdminCustomer>(ROUTES.admin.customers.anonymize(id), { method: 'POST' }),
  )
