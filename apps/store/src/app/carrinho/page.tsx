'use client'

import Link from 'next/link'
import { useCart } from '@/lib/cart'
import { formatBRL } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ShippingCalculator } from '@/components/shipping-calculator'
import { ProductImage } from '@/components/product-image'
import { QuantityStepper } from '@/components/quantity-stepper'

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
        <h1 className="text-2xl font-semibold tracking-tight">Seu carrinho está vazio</h1>
        <p className="mt-2 text-muted-foreground">Que tal dar uma olhada nas novidades?</p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Ver produtos
        </Link>
      </main>
    )
  }

  const hasUnpurchasable = items.some((i) => !i.purchasable)

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Seu carrinho</h1>

      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              'flex gap-4 rounded-lg border border-border bg-card p-3',
              !item.purchasable && 'opacity-60',
            )}
          >
            <Link href={`/produtos/${item.productSlug}`} className="relative size-20 shrink-0 overflow-hidden rounded-md bg-muted">
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

              {!item.purchasable && (
                <span className="mt-1 text-xs text-destructive">
                  {item.available === 0 ? 'Esgotado' : 'Indisponível'}
                </span>
              )}

              <div className="mt-2 flex items-center gap-3">
                <QuantityStepper
                  quantity={item.quantity}
                  available={item.available}
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

      {hasUnpurchasable && (
        <p className="mt-4 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          Alguns itens ficaram indisponíveis e não entram no total.
        </p>
      )}

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

      <Link
        href="/checkout"
        aria-disabled={(cart?.itemCount ?? 0) === 0}
        className={cn(
          'mt-6 flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90',
          (cart?.itemCount ?? 0) === 0 && 'pointer-events-none opacity-50',
        )}
      >
        Finalizar compra
      </Link>
    </main>
  )
}
