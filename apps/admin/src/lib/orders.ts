import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type {
  AdminOrder,
  AdminOrderListItem,
  OrderSituation,
  UpdateFulfillmentInput,
  CancelOrderInput,
  RefundOrderInput,
  InternalNoteInput,
  AddOrderEventInput,
} from '@ecommerce/shared/contracts'
import { apiFetch, apiFetchPaginated } from './api'

/**
 * Toda escrita devolve o pedido inteiro atualizado, então as mutações invalidam
 * a lista E o detalhe: mudar a situação no detalhe precisa mexer o chip na lista
 * quando o operador voltar.
 */

export type OrderListParams = {
  situation?: OrderSituation | undefined
  q?: string | undefined
  from?: string | undefined
  to?: string | undefined
  customerId?: string | undefined
  sort?: string | undefined
  page?: number | undefined
}

export const useOrders = (params: OrderListParams) =>
  useQuery({
    queryKey: ['orders', params],
    queryFn: () => {
      const qs = new URLSearchParams()
      qs.set('page', String(params.page ?? 1))
      qs.set('perPage', '20')
      if (params.situation) qs.set('situation', params.situation)
      if (params.q) qs.set('q', params.q)
      if (params.from) qs.set('from', params.from)
      if (params.to) qs.set('to', params.to)
      if (params.customerId) qs.set('customerId', params.customerId)
      if (params.sort) qs.set('sort', params.sort)
      return apiFetchPaginated<AdminOrderListItem>(`${ROUTES.admin.orders.list}?${qs}`)
    },
  })

export const useOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['order', id],
    enabled: !!id,
    queryFn: () => apiFetch<AdminOrder>(ROUTES.admin.orders.detail(id!)),
  })

/** Invalida lista + detalhe. Compartilhado por todas as mutações do pedido. */
const useOrderMutation = <TInput>(
  id: string,
  request: (id: string, input: TInput) => Promise<AdminOrder>,
) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => request(id, input),
    onSuccess: (order) => {
      qc.setQueryData(['order', id], order)
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['order', id] })
    },
  })
}

export const useUpdateFulfillment = (id: string) =>
  useOrderMutation<UpdateFulfillmentInput>(id, (orderId, input) =>
    apiFetch<AdminOrder>(ROUTES.admin.orders.fulfillment(orderId), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  )

export const useCancelOrder = (id: string) =>
  useOrderMutation<CancelOrderInput>(id, (orderId, input) =>
    apiFetch<AdminOrder>(ROUTES.admin.orders.cancel(orderId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )

export const useRefundOrder = (id: string) =>
  useOrderMutation<RefundOrderInput>(id, (orderId, input) =>
    apiFetch<AdminOrder>(ROUTES.admin.orders.refund(orderId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )

export const useSetInternalNote = (id: string) =>
  useOrderMutation<InternalNoteInput>(id, (orderId, input) =>
    apiFetch<AdminOrder>(ROUTES.admin.orders.note(orderId), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  )

export const useAddOrderEvent = (id: string) =>
  useOrderMutation<AddOrderEventInput>(id, (orderId, input) =>
    apiFetch<AdminOrder>(ROUTES.admin.orders.events(orderId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )
