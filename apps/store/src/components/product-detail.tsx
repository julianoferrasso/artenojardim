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
export const ProductDetail = ({ product }: { product: Product }) => {
  const options = useMemo(() => deriveOptions(product.variants), [product.variants])
  const hasOptions = options.length > 0

  const firstActive = product.variants.find((v) => v.isActive) ?? product.variants[0]
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(firstActive?.options.map((o) => [o.option, o.value]) ?? []),
  )

  const current = hasOptions ? matchVariant(product.variants, selected) : firstActive

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
      />
    </div>
  )
}
