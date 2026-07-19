'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { ROUTES } from '@ecommerce/shared/constants'
import type { Cart, AddToCartInput } from '@ecommerce/shared/contracts'
import { getAccessToken, useAuth } from './auth'
import { ApiError } from './api'

/**
 * Carrinho no browser. Client-side: bate no domínio público da API com
 * credentials (o cookie de sessão anônima E o de refresh de cliente viajam). O
 * access token de cliente (em memória, via auth) é anexado quando há sessão.
 *
 * O estado do carrinho vem SEMPRE da API recalculada — o contexto só guarda o
 * último snapshot. Nunca calcula preço/total no cliente.
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
  return ((await res.json()) as { data: T }).data
}

type CartState = {
  cart: Cart | null
  loading: boolean
  add: (input: AddToCartInput) => Promise<void>
  setQuantity: (itemId: string, quantity: number) => Promise<void>
  remove: (itemId: string) => Promise<void>
  refresh: () => Promise<void>
}

const CartContext = createContext<CartState | null>(null)

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<Cart | null>(null)
  const [loading, setLoading] = useState(true)
  const { customer } = useAuth()
  const lastCustomerId = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setCart(await call<Cart>(ROUTES.cart.get))
    } catch {
      // Sem carrinho ainda (visitante que nunca adicionou) — normal.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Quando o cliente loga (customerId passa a existir), mescla o carrinho
  // anônimo no dele e recarrega. Idempotente: sem carrinho anônimo, no-op.
  useEffect(() => {
    const id = customer?.id ?? null
    if (id && id !== lastCustomerId.current) {
      lastCustomerId.current = id
      void mergeCartAfterLogin().then(refresh)
    }
    if (!id) lastCustomerId.current = null
  }, [customer, refresh])

  const add = async (input: AddToCartInput) => {
    setCart(await call<Cart>(ROUTES.cart.items, { method: 'POST', body: JSON.stringify(input) }))
  }
  const setQuantity = async (itemId: string, quantity: number) => {
    setCart(await call<Cart>(ROUTES.cart.item(itemId), { method: 'PATCH', body: JSON.stringify({ quantity }) }))
  }
  const remove = async (itemId: string) => {
    setCart(await call<Cart>(ROUTES.cart.item(itemId), { method: 'DELETE' }))
  }

  return (
    <CartContext.Provider value={{ cart, loading, add, setQuantity, remove, refresh }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = (): CartState => {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart precisa estar dentro de <CartProvider>')
  return ctx
}

/** Chamado após o login: mescla o carrinho anônimo e recarrega. */
export const mergeCartAfterLogin = async (): Promise<void> => {
  try {
    await call(ROUTES.cart.merge, { method: 'POST' })
  } catch {
    /* sem carrinho anônimo — nada a fazer */
  }
}
