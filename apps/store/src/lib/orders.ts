'use client'

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type {
  CustomerOrder,
  CustomerOrderListItem,
  CustomerOrderListQuery,
  CustomerCancelInput,
  SupportMessageInput,
  ReorderResult,
  OrderSituation,
  OrderPeriod,
} from '@ecommerce/shared/contracts'
import { clientFetch, clientFetchPaginated } from './client'

/**
 * Pedidos do cliente. Toda escrita devolve o pedido inteiro atualizado, então as
 * mutações gravam o detalhe direto no cache e invalidam a lista — cancelar no
 * detalhe precisa mexer o chip da lista quando o cliente voltar.
 */

export type OrderListParams = {
  page?: number | undefined
  situation?: OrderSituation | undefined
  period?: OrderPeriod | undefined
  q?: string | undefined
  sort?: CustomerOrderListQuery['sort'] | undefined
  perPage?: number | undefined
}

export const orderKeys = {
  all: ['orders'] as const,
  list: (params: OrderListParams) => ['orders', 'list', params] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
}

export const useMyOrders = (params: OrderListParams) =>
  useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () => {
      const qs = new URLSearchParams()
      qs.set('page', String(params.page ?? 1))
      qs.set('perPage', String(params.perPage ?? 10))
      if (params.situation) qs.set('situation', params.situation)
      if (params.period && params.period !== 'all') qs.set('period', params.period)
      if (params.q) qs.set('q', params.q)
      if (params.sort) qs.set('sort', params.sort)
      return clientFetchPaginated<CustomerOrderListItem>(`${ROUTES.orders.list}?${qs}`)
    },
    // Mantém a página anterior visível enquanto a próxima carrega: sem isto a
    // lista pisca para vazio a cada clique em "próxima".
    placeholderData: keepPreviousData,
  })

export const useMyOrder = (id: string | undefined) =>
  useQuery({
    queryKey: orderKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: () => clientFetch<CustomerOrder>(ROUTES.orders.detail(id!)),
  })

/** Grava o pedido devolvido no cache e invalida a lista. */
const useOrderMutation = <TInput>(
  id: string,
  request: (id: string, input: TInput) => Promise<CustomerOrder>,
) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TInput) => request(id, input),
    onSuccess: (order) => {
      qc.setQueryData(orderKeys.detail(id), order)
      void qc.invalidateQueries({ queryKey: orderKeys.all })
    },
  })
}

export const useCancelOrder = (id: string) =>
  useOrderMutation<CustomerCancelInput>(id, (orderId, input) =>
    clientFetch<CustomerOrder>(ROUTES.orders.cancel(orderId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )

export const useSendSupport = (id: string) =>
  useOrderMutation<SupportMessageInput>(id, (orderId, input) =>
    clientFetch<CustomerOrder>(ROUTES.orders.support(orderId), {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )

/**
 * Não passa pelo useOrderMutation: devolve o resultado da recompra, não o
 * pedido. O pedido em si não mudou — o que mudou foi o carrinho.
 */
export const useReorder = (id: string) =>
  useMutation({
    mutationFn: () =>
      clientFetch<ReorderResult>(ROUTES.orders.reorder(id), { method: 'POST' }),
  })
