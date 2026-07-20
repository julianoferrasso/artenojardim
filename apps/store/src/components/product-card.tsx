import Link from 'next/link'
import type { ProductListItem } from '@ecommerce/shared/contracts'
import { formatBRL } from '@/lib/utils'
import { ProductImage } from './product-image'

/**
 * Card de produto da vitrine. Server Component (sem 'use client'): renderiza HTML
 * puro que não vai como JS para o browser — o maior ganho de performance, de graça.
 */
export const ProductCard = ({ product }: { product: ProductListItem }) => {
  const { min, max } = product.priceRange

  return (
    <Link
      href={`/produtos/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <ProductImage
          src={product.thumbnailUrl}
          alt={product.name}
          fit="cover"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="transition-transform group-hover:scale-105"
        />
      </div>
      <div className="flex flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium">{product.name}</h3>
        <p className="text-sm font-semibold">
          {min === max ? formatBRL(min) : `a partir de ${formatBRL(min)}`}
        </p>
      </div>
    </Link>
  )
}
