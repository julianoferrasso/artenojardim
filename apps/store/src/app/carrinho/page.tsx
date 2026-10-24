'use client'

import Link from 'next/link'
import { useCart } from '@/lib/cart'
import { formatBRL } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { ShippingCalculator } from '@/components/shipping-calculator'
import { ProductImage } from '@/components/product-image'
import { QuantityStepper } from '@/components/quantity-stepper'
import { CartItemAvailability, CartItemIssue, MadeToOrderNotice } from '@/components/stock-status'

export default function CartPage() {
  const { cart, loading, setQuantity, remove } = useCart()

  if (loading) {
    return <main className="mx-auto max-w-3xl px-4 py-12 text-center text-muted-foreground">Carregando…</main>
  }

  const items = cart?.items ?? []

  if (items.length === 0) {
    // Estado vazio = oportunidade de venda, não tela morta.
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Seu carrinho está vazio</h1>
        <p className="mt-2 text-muted-foreground">Que tal dar uma olhada nas novidades?</p>
        <Link
          href="/"
          className={cn(buttonVariants({ size: 'lg' }), 'mt-6')}
        >
          Ver produtos
        </Link>
      </main>
    )
  }

  // O checkout recusa o carrinho inteiro com um item bloqueado: melhor resolver
  // aqui, linha a linha, do que descobrir depois do frete e do endereço.
  const blocked = items.some((i) => !i.purchasable)
  const canCheckout = !blocked && (cart?.itemCount ?? 0) > 0

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">Seu carrinho</h1>

      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              'flex gap-4 rounded-xl border border-border bg-card p-3.5 shadow-soft',
              // Parcial ainda é compra (é só ajustar): esmaece só o que não tem saída.
              (item.unavailableReason === 'OUT_OF_STOCK' || item.unavailableReason === 'UNAVAILABLE') &&
                'opacity-60',
            )}
          >
            <Link href={`/produtos/${item.productSlug}`} className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
              <ProductImage
                src={item.imageUrl}
                alt={item.productName}
                fit="cover"
                sizes="80px"
              />
            </Link>

            <div className="flex min-w-0 flex-1 flex-col">
              <Link href={`/produtos/${item.productSlug}`} className="truncate font-medium hover:underline">
                {item.productName}
              </Link>
              {item.variantLabel !== '—' && (
                <span className="text-xs text-muted-foreground">{item.variantLabel}</span>
              )}
              <span className="mt-1 text-sm">{formatBRL(item.unitPrice)}</span>

              <CartItemIssue item={item} onAdjust={(quantity) => void setQuantity(item.id, quantity)} />
              <CartItemAvailability item={item} onAdjust={(quantity) => void setQuantity(item.id, quantity)} />

              <div className="mt-2 flex items-center gap-3">
                <QuantityStepper
                  quantity={item.quantity}
                  max={item.maxQuantity}
                  onChange={(quantity) => void setQuantity(item.id, quantity)}
                />
                <button
                  onClick={() => void remove(item.id)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remover
                </button>
              </div>
            </div>

            <div className="text-right text-sm font-medium">{formatBRL(item.lineTotal)}</div>
          </li>
        ))}
      </ul>

      {blocked && (
        <p role="status" className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          Alguns itens mudaram desde que você os adicionou. Ajuste ou remova os destacados para finalizar a compra.
        </p>
      )}

      <MadeToOrderNotice items={items.filter((i) => i.purchasable)} className="mt-4" />

      <div className="mt-6">
        <ShippingCalculator
          items={items
            .filter((i) => i.purchasable)
            .map((i) => ({ variantId: i.variantId, quantity: i.quantity }))}
          disabled={!items.some((i) => i.purchasable)}
        />
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="text-xl font-semibold">{formatBRL(cart?.subtotal ?? 0)}</span>
      </div>
      <p className="mt-1 text-right text-xs text-muted-foreground">
        Frete confirmado no checkout.
      </p>

      {/* Bloqueado é um <button disabled>, não um Link apagado: o
          pointer-events-none ainda deixava o teclado abrir o checkout. */}
      {canCheckout ? (
        <Link href="/checkout" className={cn(buttonVariants({ size: 'lg' }), 'mt-6 w-full')}>
          Finalizar compra
        </Link>
      ) : (
        <Button size="lg" disabled className="mt-6 w-full">
          Finalizar compra
        </Button>
      )}
    </main>
  )
}
