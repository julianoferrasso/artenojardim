import Link from 'next/link'
import type { ProductListItem } from '@ecommerce/shared/contracts'
import { formatBRL } from '@/lib/utils'
import { ProductImage } from './product-image'
import { FavoriteButton } from './favorite-button'

/**
 * Card de produto da vitrine. Server Component (sem 'use client'): renderiza HTML
 * puro que não vai como JS para o browser — o maior ganho de performance, de graça.
 * A única ilha client é o coração de favoritar.
 */
export const ProductCard = ({ product }: { product: ProductListItem }) => {
  const { min, max } = product.priceRange

  return (
    <Link
      href={`/produtos/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <ProductImage
          src={product.thumbnailUrl}
          alt={product.name}
          fit="cover"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="transition-transform duration-500 group-hover:scale-105"
        />
        <FavoriteButton
          product={{ id: product.id, slug: product.slug }}
          className="absolute right-2.5 top-2.5 size-9 bg-card/90 shadow-soft backdrop-blur-sm"
          iconClassName="size-4.5"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</h3>
        {min === max ? (
          <p className="mt-auto text-base font-semibold">{formatBRL(min)}</p>
        ) : (
          <p className="mt-auto text-base font-semibold">
            <span className="text-xs font-normal text-muted-foreground">a partir de </span>
            {formatBRL(min)}
          </p>
        )}
      </div>
    </Link>
  )
}
