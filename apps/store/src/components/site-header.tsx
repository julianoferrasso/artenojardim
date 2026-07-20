import Image from 'next/image'
import Link from 'next/link'
import { ChevronDown, Search } from 'lucide-react'
import type { CategoryTreeNode } from '@ecommerce/shared/contracts'
import { AccountNav } from './account-nav'
import { CartBadge } from './cart-badge'
import { FavoritesBadge } from './favorites-badge'
import { MobileMenu } from './mobile-menu'

/**
 * Cabeçalho da loja. Server Component: as categorias vêm da API no servidor e
 * viram HTML — o menu não custa JS no browser. A busca é um form GET simples
 * (funciona sem JS; o SSR renderiza os resultados). Interatividade fica nas
 * ilhas client: menu mobile, conta, favoritos e carrinho.
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
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center gap-2 py-3 md:gap-6">
          <MobileMenu storeName={storeName} categories={topLevel} />

          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <Image
              src="/logo-bird.png"
              alt=""
              width={40}
              height={40}
              priority
              className="size-9 md:size-10"
            />
            <span className="font-display text-xl font-semibold tracking-tight md:text-2xl">
              {storeName}
            </span>
          </Link>

          <form action="/busca" method="get" className="relative mx-auto hidden w-full max-w-md md:block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              placeholder="O que você procura?"
              aria-label="Buscar produtos"
              className="h-10 w-full rounded-full border border-input bg-muted/60 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-0.5 md:gap-1">
            <AccountNav />
            <FavoritesBadge />
            <CartBadge />
          </div>
        </div>

        {/* Busca no mobile: linha própria, sempre visível — busca não se esconde em menu. */}
        <form action="/busca" method="get" className="pb-3 md:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              placeholder="O que você procura?"
              aria-label="Buscar produtos"
              className="h-10 w-full rounded-full border border-input bg-muted/60 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
        </form>
      </div>

      {/* Nav de categorias no desktop, com dropdown CSS-only (hover + focus-within). */}
      {topLevel.length > 0 && (
        <nav aria-label="Categorias" className="hidden border-t border-border/60 md:block">
          <ul className="mx-auto flex max-w-6xl items-center justify-center gap-1 px-4">
            {topLevel.map((cat) => {
              const subcategories = cat.children.filter((c) => c.isActive)

              return (
                <li key={cat.id} className="group relative">
                  <Link
                    href={`/categorias/${cat.slug}`}
                    className="flex items-center gap-1 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {cat.name}
                    {subcategories.length > 0 && (
                      <ChevronDown className="size-3.5 transition-transform group-hover:rotate-180" />
                    )}
                  </Link>

                  {subcategories.length > 0 && (
                    <div className="invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-1 opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                      <ul className="min-w-48 rounded-xl border border-border bg-popover p-1.5 shadow-card">
                        {subcategories.map((sub) => (
                          <li key={sub.id}>
                            <Link
                              href={`/categorias/${sub.slug}`}
                              className="block rounded-lg px-3 py-2 text-sm text-popover-foreground transition-colors hover:bg-accent"
                            >
                              {sub.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </header>
  )
}
