'use client'

import { useMemo, useState } from 'react'
import type { Product } from '@ecommerce/shared/contracts'
import { deriveOptions, matchVariant } from '@/lib/product-options'
import { ProductGallery } from './product-gallery'
import { ProductPurchasePanel } from './product-purchase-panel'

/**
 * Dono do estado da variação selecionada — que a galeria E o painel de compra
 * precisam. Só isso: o resto é delegado. A descrição ficou no Server Component,
 * fora do bundle do cliente.
 */
export const ProductDetail = ({
  product,
  hasAlternatives,
  handlingDays,
}: {
  product: Product
  /** A página achou alternativas para o produto esgotado (a seção #alternativas existe). */
  hasAlternatives: boolean
  handlingDays: number | null
}) => {
  const options = useMemo(() => deriveOptions(product.variants), [product.variants])
  const hasOptions = options.length > 0

  // Abre na primeira variação que dá para comprar: abrir no "Esgotado" quando a
  // outra cor tem estoque faria o cliente achar que o produto inteiro acabou.
  // E a pronta entrega antes da encomenda: a que chega antes é a que vende.
  const isReady = (v: Product['variants'][number]) => v.stockStatus === 'IN_STOCK' || v.stockStatus === 'LOW_STOCK'
  const initial =
    product.variants.find((v) => v.isActive && isReady(v)) ??
    product.variants.find((v) => v.isActive && v.stockStatus !== 'OUT_OF_STOCK') ??
    product.variants.find((v) => v.isActive) ??
    product.variants[0]
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial?.options.map((o) => [o.option, o.value]) ?? []),
  )

  const current = hasOptions ? matchVariant(product.variants, selected) : initial

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <ProductGallery
        images={product.images}
        variantId={current?.id ?? null}
        productName={product.name}
      />

      <ProductPurchasePanel
        product={product}
        options={options}
        selected={selected}
        onSelect={setSelected}
        current={current}
        hasAlternatives={hasAlternatives}
        handlingDays={handlingDays}
      />
    </div>
  )
}
