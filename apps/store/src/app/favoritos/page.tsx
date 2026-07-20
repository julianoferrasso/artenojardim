import type { Metadata } from 'next'
import { FavoritesList } from '@/components/favorites-list'

export const metadata: Metadata = {
  title: 'Favoritos',
  robots: { index: false },
}

/** Casca server (metadata); a lista é client — os favoritos vivem no navegador. */
export default function FavoritesPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Meus favoritos</h1>
      <p className="mt-1 mb-8 text-muted-foreground">
        Guardados neste navegador para você voltar quando quiser.
      </p>
      <FavoritesList />
    </main>
  )
}
