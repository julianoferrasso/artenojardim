'use client'

import Link from 'next/link'
import { useQueries } from '@tanstack/react-query'
import { HeartOff, Trash2 } from 'lucide-react'
import type { Product } from '@ecommerce/shared/contracts'
import { ROUTES } from '@ecommerce/shared/constants'
import { useFavorites, type FavoriteEntry } from '@/lib/favorites'
import { clientFetch } from '@/lib/client'
import { ApiError } from '@/lib/api'
import { formatBRL } from '@/lib/utils'
import { ProductImage } from './product-image'
import { FavoriteButton } from './favorite-button'
import { Skeleton } from './ui/skeleton'
import { buttonVariants } from './ui/button'

/**
 * Lista de favoritos. Os ids/slugs vêm do localStorage; nome, preço e imagem
 * vêm SEMPRE da API — favorito de ontem não pode exibir preço de ontem.
 * Produto que sumiu do catálogo (404) vira card "indisponível" com remover.
 */
export const FavoritesList = () => {
  const { favorites, ready, remove } = useFavorites()

  const queries = useQueries({
    queries: favorites.map((fav) => ({
      queryKey: ['favorite-product', fav.slug],
      queryFn: () => clientFetch<Product>(ROUTES.products.detail(fav.slug)),
      retry: false,
    })),
  })

  if (!ready) return <FavoritesSkeleton />

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-secondary">
          <HeartOff className="size-6 text-secondary-foreground" />
        </span>
        <div>
          <p className="font-display text-xl font-semibold">Nenhum favorito ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Toque no coração de um produto para guardá-lo aqui.
          </p>
        </div>
        <Link href="/" className={buttonVariants({ size: 'lg' })}>
          Descobrir produtos
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {favorites.map((fav, i) => {
        const query = queries[i]
        if (!query) return null

        if (query.isPending) {
          return (
            <div key={fav.id} className="flex flex-col gap-3">
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          )
        }

        if (query.isError) {
          const gone = query.error instanceof ApiError && query.error.status === 404
          return <UnavailableCard key={fav.id} fav={fav} gone={gone} onRemove={remove} />
        }

        return <FavoriteCard key={fav.id} fav={fav} product={query.data} />
      })}
    </div>
  )
}

const FavoriteCard = ({ fav, product }: { fav: FavoriteEntry; product: Product }) => {
  const { min, max } = product.priceRange
  const image = product.images[0]

  return (
    <Link
      href={`/produtos/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <ProductImage
          src={image?.url ?? null}
          alt={product.name}
          fit="cover"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="transition-transform duration-500 group-hover:scale-105"
        />
        <FavoriteButton
          product={{ id: fav.id, slug: fav.slug }}
          className="absolute right-2.5 top-2.5 size-9 bg-card/90 shadow-soft backdrop-blur-sm"
          iconClassName="size-4.5"
        />
      </div>
      <div className="flex flex-col gap-1 p-3.5">
        <h3 className="line-clamp-2 text-sm font-medium">{product.name}</h3>
        {min === max ? (
          <p className="text-base font-semibold">{formatBRL(min)}</p>
        ) : (
          <p className="text-base font-semibold">
            <span className="text-xs font-normal text-muted-foreground">a partir de </span>
            {formatBRL(min)}
          </p>
        )}
      </div>
    </Link>
  )
}

const UnavailableCard = ({
  fav,
  gone,
  onRemove,
}: {
  fav: FavoriteEntry
  gone: boolean
  onRemove: (id: string) => void
}) => (
  <div className="flex flex-col overflow-hidden rounded-xl border border-dashed border-border bg-card/50">
    <div className="flex aspect-square items-center justify-center bg-muted/50">
      <HeartOff className="size-8 text-muted-foreground/50" />
    </div>
    <div className="flex flex-col gap-2 p-3.5">
      <p className="text-sm text-muted-foreground">
        {gone ? 'Este produto não está mais disponível.' : 'Não foi possível carregar o produto.'}
      </p>
      <button
        type="button"
        onClick={() => onRemove(fav.id)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
        Remover dos favoritos
      </button>
    </div>
  </div>
)

const FavoritesSkeleton = () => (
  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
    {Array.from({ length: 4 }, (_, i) => (
      <div key={i} className="flex flex-col gap-3">
        <Skeleton className="aspect-square rounded-xl" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    ))}
  </div>
)
