'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

/**
 * Favoritos em localStorage — sem backend por decisão de escopo. Guardamos SÓ
 * id/slug: preço e nome vêm sempre da API na hora de exibir ("o front nunca
 * decide valor"), e um produto renomeado/removido não apodrece no storage.
 * Quando a wishlist server-side nascer (flag já prevista), este arquivo vira a
 * fonte de migração.
 */

export type FavoriteEntry = {
  id: string
  slug: string
  addedAt: number
}

const STORAGE_KEY = 'anj:favorites:v1'

const readStorage = (): FavoriteEntry[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is FavoriteEntry =>
        typeof e === 'object' && e !== null && typeof (e as FavoriteEntry).id === 'string' &&
        typeof (e as FavoriteEntry).slug === 'string',
    )
  } catch {
    // Storage bloqueado (modo privado) ou JSON corrompido: favoritos viram
    // sessão vazia, nunca um crash na loja.
    return []
  }
}

const writeStorage = (entries: FavoriteEntry[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Cheio/bloqueado: o estado em memória continua valendo para esta aba.
  }
}

type FavoritesContextValue = {
  favorites: FavoriteEntry[]
  count: number
  /** false até hidratar do localStorage — evita piscar "0" errado no badge. */
  ready: boolean
  isFavorite: (id: string) => boolean
  toggle: (entry: { id: string; slug: string }) => void
  remove: (id: string) => void
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export const FavoritesProvider = ({ children }: { children: ReactNode }) => {
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([])
  const [ready, setReady] = useState(false)

  // Hidrata pós-mount: no SSR não existe localStorage, e ler no primeiro render
  // causaria mismatch de hidratação.
  useEffect(() => {
    setFavorites(readStorage())
    setReady(true)
  }, [])

  // Outra aba favoritou? O evento `storage` só dispara nas DEMAIS abas.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setFavorites(readStorage())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback((entry: { id: string; slug: string }) => {
    setFavorites((prev) => {
      const next = prev.some((f) => f.id === entry.id)
        ? prev.filter((f) => f.id !== entry.id)
        : [{ ...entry, addedAt: Date.now() }, ...prev]
      writeStorage(next)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.filter((f) => f.id !== id)
      writeStorage(next)
      return next
    })
  }, [])

  const isFavorite = useCallback(
    (id: string) => favorites.some((f) => f.id === id),
    [favorites],
  )

  return (
    <FavoritesContext.Provider
      value={{ favorites, count: favorites.length, ready, isFavorite, toggle, remove }}
    >
      {children}
    </FavoritesContext.Provider>
  )
}

export const useFavorites = (): FavoritesContextValue => {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites precisa estar dentro de FavoritesProvider')
  return ctx
}
