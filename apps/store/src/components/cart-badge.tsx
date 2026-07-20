'use client'

import { ShoppingBag } from 'lucide-react'
import { useCart } from '@/lib/cart'

/** Ícone do carrinho no header. Abre o minicarrinho; /carrinho segue por deep link. */
export const CartBadge = () => {
  const { cart, isOpen, openCart } = useCart()
  const count = cart?.itemCount ?? 0

  return (
    <button
      type="button"
      onClick={openCart}
      className="relative flex size-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
      aria-label="Carrinho"
      aria-expanded={isOpen}
      aria-haspopup="dialog"
    >
      <ShoppingBag className="size-5" strokeWidth={1.8} />
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
          {count}
        </span>
      )}
    </button>
  )
}
