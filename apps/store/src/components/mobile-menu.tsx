'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronDown, Heart, Menu, User, X } from 'lucide-react'
import type { CategoryTreeNode } from '@ecommerce/shared/contracts'
import { useBodyScrollLock, useEscapeKey, useFocusTrap } from '@/lib/overlay'

/**
 * Menu mobile em drawer, mesmo padrão de overlay do minicarrinho (portal +
 * hooks a11y de lib/overlay). Recebe a árvore de categorias já resolvida pelo
 * header server — este componente não busca nada.
 */
export const MobileMenu = ({
  storeName,
  categories,
}: {
  storeName: string
  categories: CategoryTreeNode[]
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const close = () => setIsOpen(false)

  useFocusTrap(panelRef, isOpen)
  useBodyScrollLock(isOpen)
  useEscapeKey(close, isOpen)

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Abrir menu"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="flex size-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent md:hidden"
      >
        <Menu className="size-5" strokeWidth={1.8} />
      </button>

      {mounted && isOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-foreground/50 animate-in fade-in duration-200"
              onClick={close}
              aria-hidden
            />

            <div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="absolute inset-y-0 left-0 flex w-full max-w-xs flex-col bg-background shadow-card outline-none animate-in slide-in-from-left duration-300"
            >
              <header className="flex items-center justify-between border-b border-border p-4">
                <Link href="/" onClick={close} className="flex items-center gap-2">
                  <Image src="/logo-bird.png" alt="" width={32} height={32} className="size-8" />
                  <span className="font-display text-lg font-semibold tracking-tight">
                    {storeName}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Fechar menu"
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-5" />
                </button>
              </header>

              <nav className="flex-1 overflow-y-auto p-4">
                <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Categorias
                </p>
                <ul className="flex flex-col">
                  {categories.map((cat) =>
                    cat.children.filter((c) => c.isActive).length > 0 ? (
                      <li key={cat.id}>
                        {/* <details> nativo: accordion sem estado nem JS extra. */}
                        <details className="group">
                          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent [&::-webkit-details-marker]:hidden">
                            {cat.name}
                            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                          </summary>
                          <ul className="mb-1 ml-2 flex flex-col border-l border-border pl-3">
                            <li>
                              <Link
                                href={`/categorias/${cat.slug}`}
                                onClick={close}
                                className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              >
                                Ver tudo
                              </Link>
                            </li>
                            {cat.children
                              .filter((c) => c.isActive)
                              .map((sub) => (
                                <li key={sub.id}>
                                  <Link
                                    href={`/categorias/${sub.slug}`}
                                    onClick={close}
                                    className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                  >
                                    {sub.name}
                                  </Link>
                                </li>
                              ))}
                          </ul>
                        </details>
                      </li>
                    ) : (
                      <li key={cat.id}>
                        <Link
                          href={`/categorias/${cat.slug}`}
                          onClick={close}
                          className="block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                        >
                          {cat.name}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              </nav>

              <footer className="border-t border-border p-4">
                <Link
                  href="/conta"
                  onClick={close}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <User className="size-4.5 text-muted-foreground" strokeWidth={1.8} />
                  Minha conta
                </Link>
                <Link
                  href="/favoritos"
                  onClick={close}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                >
                  <Heart className="size-4.5 text-muted-foreground" strokeWidth={1.8} />
                  Favoritos
                </Link>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
