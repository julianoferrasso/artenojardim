'use client'

import Link from 'next/link'
import { Heart } from 'lucide-react'
import { useFavorites } from '@/lib/favorites'

/** Ícone de favoritos no header. A contagem só aparece depois de hidratar. */
export const FavoritesBadge = () => {
  const { count, ready } = useFavorites()

  return (
    <Link
      href="/favoritos"
      aria-label={`Favoritos${ready && count > 0 ? ` (${count})` : ''}`}
      className="relative flex size-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
    >
      <Heart className="size-5" strokeWidth={1.8} />
      {ready && count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
          {count}
        </span>
      )}
    </Link>
  )
}
