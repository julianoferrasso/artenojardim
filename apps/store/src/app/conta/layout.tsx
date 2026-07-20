'use client'

import { useEffect, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

/**
 * Casca da área do cliente: guard, largura e navegação, num lugar só.
 *
 * O guard é conveniência de UX — a proteção real é a API, que exige o token e
 * confere a posse. Antes disto, cada página da conta repetia o mesmo useEffect,
 * o mesmo "Carregando…" e o mesmo <main>; a terceira cópia seria o momento em
 * que uma delas ficaria para trás numa correção.
 */

const LINKS = [
  { href: '/conta', label: 'Visão geral' },
  { href: '/conta/pedidos', label: 'Meus pedidos' },
  { href: '/conta/enderecos', label: 'Endereços' },
]

export default function ContaLayout({ children }: { children: ReactNode }) {
  const { customer, loading, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !customer) router.replace('/entrar')
  }, [loading, customer, router])

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-12 text-center text-muted-foreground">
        Carregando…
      </main>
    )
  }
  if (!customer) return null

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <div className="md:grid md:grid-cols-[200px_1fr] md:gap-10">
        {/* Abaixo de md vira uma linha rolável: menu lateral em 375px comeria
            metade da tela do celular, que é onde a maioria abre "meus pedidos". */}
        <nav className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 scrollbar-none md:mx-0 md:mb-0 md:flex-col md:overflow-visible md:px-0">
          {LINKS.map((link) => {
            const active =
              link.href === '/conta' ? pathname === '/conta' : pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'shrink-0 rounded-lg px-3 py-2 text-sm transition-colors md:shrink',
                  active
                    ? 'bg-secondary font-medium text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {link.label}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => void logout().then(() => router.replace('/'))}
            className="shrink-0 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:mt-4 md:shrink md:border-t md:border-border md:pt-4"
          >
            Sair
          </button>
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </main>
  )
}
