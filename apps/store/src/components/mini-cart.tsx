'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X } from 'lucide-react'
import { useCart } from '@/lib/cart'
import { formatBRL, cn } from '@/lib/utils'
import { useBodyScrollLock, useEscapeKey, useFocusTrap } from '@/lib/overlay'
import { ProductImage } from './product-image'
import { QuantityStepper } from './quantity-stepper'

/**
 * Minicarrinho. Abre ao adicionar um produto e pelo ícone do header — o cliente
 * confirma o que entrou sem perder a página onde estava. `/carrinho` continua
 * existindo para deep link e para quem quer a tela inteira.
 */
export const MiniCart = () => {
  const { cart, isOpen, closeCart, setQuantity, remove } = useCart()
  const panelRef = useRef<HTMLDivElement>(null)
  // O portal só existe no cliente; sem isto o primeiro render no servidor quebra.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useFocusTrap(panelRef, isOpen)
  useBodyScrollLock(isOpen)
  useEscapeKey(closeCart, isOpen)

  if (!mounted || !isOpen) return null

  const items = cart?.items ?? []

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-foreground/50 animate-in fade-in duration-200"
        onClick={closeCart}
        aria-hidden
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mini-cart-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col rounded-l-2xl bg-background shadow-card outline-none animate-in slide-in-from-right duration-300"
      >
        <header className="flex items-center justify-between border-b border-border p-4">
          <h2 id="mini-cart-title" className="font-display text-lg font-semibold">
            Seu carrinho{items.length > 0 ? ` (${cart?.itemCount ?? 0})` : ''}
          </h2>
          <button
            type="button"
            onClick={closeCart}
            aria-label="Fechar carrinho"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </header>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="font-medium">Seu carrinho está vazio</p>
            <p className="text-sm text-muted-foreground">Que tal dar uma olhada nas novidades?</p>
            <Link
              href="/"
              onClick={closeCart}
              className="mt-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-soft transition-all duration-200 hover:bg-primary/90"
            >
              Ver produtos
            </Link>
          </div>
        ) : (
          <ul className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {items.map((item) => (
              <li
                key={item.id}
                className={cn('flex gap-3', !item.purchasable && 'opacity-60')}
              >
                <Link
                  href={`/produtos/${item.productSlug}`}
                  onClick={closeCart}
                  className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted"
                >
                  <ProductImage
                    src={item.imageUrl}
                    alt={item.productName}
                    fit="cover"
                    sizes="64px"
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    href={`/produtos/${item.productSlug}`}
                    onClick={closeCart}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {item.productName}
                  </Link>
                  {item.variantLabel !== '—' && (
                    <span className="text-xs text-muted-foreground">{item.variantLabel}</span>
                  )}
                  <span className="mt-0.5 text-sm">{formatBRL(item.unitPrice)}</span>

                  {!item.purchasable && (
                    <span className="text-xs text-destructive">
                      {item.available === 0 ? 'Esgotado' : 'Indisponível'}
                    </span>
                  )}

                  <div className="mt-1.5 flex items-center gap-2">
                    <QuantityStepper
                      quantity={item.quantity}
                      available={item.available}
                      onChange={(quantity) => void setQuantity(item.id, quantity)}
                    />
                    <button
                      type="button"
                      onClick={() => void remove(item.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <footer className="border-t border-border p-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-lg font-semibold">{formatBRL(cart?.subtotal ?? 0)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Frete calculado no checkout.</p>

            <Link
              href="/checkout"
              onClick={closeCart}
              className="mt-3 flex h-12 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-soft transition-all duration-200 hover:bg-primary/90"
            >
              Finalizar compra
            </Link>
            <Link
              href="/carrinho"
              onClick={closeCart}
              className="mt-2 flex h-9 w-full items-center justify-center text-sm text-muted-foreground hover:text-foreground"
            >
              Ver carrinho completo
            </Link>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
