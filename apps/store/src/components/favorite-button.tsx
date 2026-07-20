'use client'

import { Heart } from 'lucide-react'
import { useFavorites } from '@/lib/favorites'
import { cn } from '@/lib/utils'

/**
 * Coração de favoritar. Vive DENTRO de um <Link> no card de produto, por isso
 * o preventDefault/stopPropagation — clicar no coração não pode navegar.
 */
export const FavoriteButton = ({
  product,
  className,
  iconClassName,
}: {
  product: { id: string; slug: string }
  className?: string
  iconClassName?: string
}) => {
  const { isFavorite, toggle, ready } = useFavorites()
  const active = ready && isFavorite(product.id)

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggle(product)
      }}
      className={cn(
        'flex items-center justify-center rounded-full transition-all duration-200 active:scale-90',
        className,
      )}
    >
      <Heart
        strokeWidth={1.8}
        className={cn(
          'transition-colors',
          active ? 'fill-primary text-primary' : 'text-muted-foreground hover:text-primary',
          iconClassName,
        )}
      />
    </button>
  )
}
