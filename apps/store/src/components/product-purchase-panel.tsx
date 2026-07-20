'use client'

import { useState } from 'react'
import type { Product, Variant } from '@ecommerce/shared/contracts'
import type { DerivedOption } from '@/lib/product-options'
import { formatBRL } from '@/lib/utils'
import { useCart } from '@/lib/cart'
import { ApiError } from '@/lib/api'
import { VariantSelector } from './variant-selector'
import { ShippingCalculator } from './shipping-calculator'
import { FavoriteButton } from './favorite-button'
import { Button } from './ui/button'

/**
 * Preço, opções, comprar e frete. Adicionar ao carrinho abre o minicarrinho em
 * vez de navegar para /carrinho: arrancar o cliente da página do produto matava
 * a chance de um segundo item.
 */
export const ProductPurchasePanel = ({
  product,
  options,
  selected,
  onSelect,
  current,
}: {
  product: Product
  options: DerivedOption[]
  selected: Record<string, string>
  onSelect: (selected: Record<string, string>) => void
  current: Variant | undefined
}) => {
  const { add, openCart } = useCart()
  const [adding, setAdding] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const onAdd = async () => {
    if (!current) return
    setAdding(true)
    setFeedback(null)
    try {
      await add({ variantId: current.id, quantity: 1 })
      openCart()
    } catch (e) {
      // A API é a barreira: estoque insuficiente, produto indisponível → mostra
      // o motivo em vez de reimplementar a regra aqui.
      setFeedback(e instanceof ApiError ? e.message : 'Não foi possível adicionar.')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{product.name}</h1>

      {current ? (
        <p className="text-2xl font-semibold">
          {formatBRL(current.price)}
          {current.compareAtPrice && current.compareAtPrice > current.price && (
            <span className="ml-2 text-base font-normal text-muted-foreground line-through">
              {formatBRL(current.compareAtPrice)}
            </span>
          )}
        </p>
      ) : (
        <p className="text-muted-foreground">Combinação indisponível</p>
      )}

      {options.length > 0 && (
        <VariantSelector options={options} value={selected} onChange={onSelect} />
      )}

      <div className="mt-2 flex items-center gap-2">
        <Button
          onClick={() => void onAdd()}
          disabled={!current || !current.isActive || adding}
          size="lg"
          className="flex-1"
        >
          {adding ? 'Adicionando…' : 'Adicionar ao carrinho'}
        </Button>
        <FavoriteButton
          product={{ id: product.id, slug: product.slug }}
          className="size-12 shrink-0 rounded-lg border border-input bg-card hover:bg-accent"
          iconClassName="size-5"
        />
      </div>
      {feedback && (
        <p role="alert" className="text-sm text-destructive">
          {feedback}
        </p>
      )}

      <ShippingCalculator
        items={current ? [{ variantId: current.id, quantity: 1 }] : []}
        disabled={!current}
      />
    </div>
  )
}
