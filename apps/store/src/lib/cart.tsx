'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { ROUTES } from '@ecommerce/shared/constants'
import type { Cart, AddToCartInput } from '@ecommerce/shared/contracts'
import { useAuth } from './auth'
import { clientFetch as call } from './client'

/**
 * Carrinho no browser. Usa o `clientFetch` compartilhado: o cookie de sessão
 * anônima e o de refresh viajam por `credentials`, o access token de cliente é
 * anexado quando há sessão, e o 401 por token expirado RENOVA a sessão em vez de
 * falhar — que era o que fazia o carrinho quebrar numa aba aberta há mais de 15
 * minutos.
 *
 * O estado do carrinho vem SEMPRE da API recalculada — o contexto só guarda o
 * último snapshot. Nunca calcula preço/total no cliente.
 */

type CartState = {
  cart: Cart | null
  loading: boolean
  add: (input: AddToCartInput) => Promise<void>
  setQuantity: (itemId: string, quantity: number) => Promise<void>
  remove: (itemId: string) => Promise<void>
  refresh: () => Promise<void>
  /** Estado do minicarrinho. Abrir o carrinho É estado de carrinho — não vale
   *  um provider de UI só para isto (arquitetura §mais simples que cresce). */
  isOpen: boolean
  openCart: () => void
  closeCart: () => void
}

const CartContext = createContext<CartState | null>(null)

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<Cart | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
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

  const openCart = useCallback(() => setIsOpen(true), [])
  const closeCart = useCallback(() => setIsOpen(false), [])

  return (
    <CartContext.Provider
      value={{ cart, loading, add, setQuantity, remove, refresh, isOpen, openCart, closeCart }}
    >
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
