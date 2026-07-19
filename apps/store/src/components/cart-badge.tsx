'use client'

import Link from 'next/link'
import { useCart } from '@/lib/cart'

/** Ícone do carrinho no header com a contagem de itens. Client (usa o contexto). */
export const CartBadge = () => {
  const { cart } = useCart()
  const count = cart?.itemCount ?? 0

  return (
    <Link href="/carrinho" className="relative flex items-center" aria-label="Carrinho">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-foreground">
        <path d="M6 6h15l-1.5 9h-12z" strokeLinejoin="round" />
        <path d="M6 6L5 3H2" strokeLinecap="round" />
        <circle cx="9" cy="20" r="1.4" fill="currentColor" />
        <circle cx="18" cy="20" r="1.4" fill="currentColor" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
          {count}
        </span>
      )}
    </Link>
  )
}
