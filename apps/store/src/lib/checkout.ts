'use client'

import { ROUTES } from '@ecommerce/shared/constants'
import type { ConfirmCheckoutInput, Order } from '@ecommerce/shared/contracts'
import { getAccessToken } from './auth'
import { ApiError } from './api'

/**
 * Checkout e pedidos no browser. Cliente logado: anexa o Bearer em memória. O
 * front manda só ids e escolhas — o backend recalcula tudo e devolve o pedido.
 */

const apiBase = (): string => {
  const url = process.env.NEXT_PUBLIC_API_URL
  if (!url) throw new Error('NEXT_PUBLIC_API_URL não configurada')
  return url
}

const call = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = getAccessToken()
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(body?.error?.code ?? 'INTERNAL_ERROR', body?.error?.message ?? `Erro ${res.status}`, res.status)
  }
  if (res.status === 204) return undefined as T
  return ((await res.json()) as { data: T }).data
}

export const confirmCheckout = (input: ConfirmCheckoutInput): Promise<Order> =>
  call<Order>(ROUTES.checkout.confirm, { method: 'POST', body: JSON.stringify(input) })

export const getOrder = (id: string): Promise<Order> => call<Order>(ROUTES.orders.detail(id))
