import Link from 'next/link'
import type { ProductListItem } from '@ecommerce/shared/contracts'
import { formatBRL, cn } from '@/lib/utils'
import { ProductImage } from './product-image'
import { FavoriteButton } from './favorite-button'
import { SOLD_OUT_IMAGE_CLASS, SoldOutBadge } from './stock-status'

/**
 * Card de produto da vitrine. Server Component (sem 'use client'): renderiza HTML
 * puro que não vai como JS para o browser — o maior ganho de performance, de graça.
 * A única ilha client é o coração de favoritar.
 *
 * `showcase` é o formato da seção Destaques da home (texto centrado + "Comprar"
 * em caps); o default preserva o card das grades de busca/categoria.
 */
export const ProductCard = ({
  product,
  showcase = false,
}: {
  product: ProductListItem
  showcase?: boolean
}) => {
  const { min, max } = product.priceRange
  // Esgotado continua clicável: a página dele tem o Avise-me e as alternativas.
  const soldOut = product.stockStatus === 'OUT_OF_STOCK'
  // O "Avise-me" do formato showcase leva direto ao formulário; na grade o card
  // não promete ação nenhuma e abre a página do topo.
  const href = `/produtos/${product.slug}${showcase && soldOut ? '#avise-me' : ''}`

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <ProductImage
          src={product.thumbnailUrl}
          alt={product.name}
          fit="cover"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className={cn('transition-transform duration-500 group-hover:scale-105', soldOut && SOLD_OUT_IMAGE_CLASS)}
        />
        {soldOut && <SoldOutBadge className="absolute left-2.5 top-2.5" />}
        <FavoriteButton
          product={{ id: product.id, slug: product.slug }}
          className="absolute right-2.5 top-2.5 size-9 bg-card/90 shadow-soft backdrop-blur-sm"
          iconClassName="size-4.5"
        />
      </div>
      <div className={cn('flex flex-1 flex-col gap-1 p-3.5', showcase && 'items-center text-center')}>
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</h3>
        {min === max ? (
          <p className={cn('mt-auto text-base font-semibold', soldOut && 'text-muted-foreground')}>
            {formatBRL(min)}
          </p>
        ) : (
          <p className={cn('mt-auto text-base font-semibold', soldOut && 'text-muted-foreground')}>
            <span className="text-xs font-normal text-muted-foreground">a partir de </span>
            {formatBRL(min)}
          </p>
        )}
        {showcase && (
          <span className="mt-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-primary-ink underline-offset-4 group-hover:underline">
            {soldOut ? 'Avise-me' : 'Comprar'}
          </span>
        )}
      </div>
    </Link>
  )
}
