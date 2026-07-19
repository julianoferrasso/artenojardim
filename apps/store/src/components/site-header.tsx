import Link from 'next/link'
import type { CategoryTreeNode } from '@ecommerce/shared/contracts'
import { AccountNav } from './account-nav'
import { CartBadge } from './cart-badge'

/**
 * Cabeçalho da loja. Server Component: as categorias vêm da API no servidor e
 * viram HTML — o menu não custa JS no browser. A busca é um form GET simples
 * (funciona sem JS; o SSR renderiza os resultados).
 */
export const SiteHeader = ({
  storeName,
  categories,
}: {
  storeName: string
  categories: CategoryTreeNode[]
}) => {
  const topLevel = categories.filter((c) => c.isActive)

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/" className="shrink-0 text-lg font-semibold tracking-tight">
          {storeName}
        </Link>

        <nav className="hidden flex-1 items-center gap-4 md:flex">
          {topLevel.map((cat) => (
            <Link
              key={cat.id}
              href={`/categorias/${cat.slug}`}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {cat.name}
            </Link>
          ))}
        </nav>

        <form action="/busca" method="get" className="ml-auto flex items-center">
          <input
            type="search"
            name="q"
            placeholder="Buscar…"
            aria-label="Buscar produtos"
            className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:w-48 focus-visible:ring-2 focus-visible:ring-ring transition-[width]"
          />
        </form>

        <AccountNav />
        <CartBadge />
      </div>

      {/* Categorias no mobile: linha rolável abaixo do header. */}
      {topLevel.length > 0 && (
        <nav className="flex gap-3 overflow-x-auto border-t border-border px-4 py-2 md:hidden">
          {topLevel.map((cat) => (
            <Link
              key={cat.id}
              href={`/categorias/${cat.slug}`}
              className="whitespace-nowrap text-sm text-muted-foreground"
            >
              {cat.name}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}
