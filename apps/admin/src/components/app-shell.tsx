'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FolderTree,
  Boxes,
  Images,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string; icon: LucideIcon }

/**
 * Ordem = frequência de uso no dia a dia da loja. O Dashboard mora em `/` porque
 * é a primeira coisa que o lojista quer ver ao abrir o painel.
 */
const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pedidos', label: 'Pedidos', icon: ShoppingCart },
  { href: '/produtos', label: 'Produtos', icon: Package },
  { href: '/categorias', label: 'Categorias', icon: FolderTree },
  { href: '/estoque', label: 'Estoque', icon: Boxes },
  { href: '/uploads', label: 'Biblioteca de mídia', icon: Images },
]

/**
 * Rotas sem casca: a tela de login se desenha sozinha, e as telas de impressão
 * viram papel — sidebar e header sairiam na folha. O AuthGuard envolve por fora,
 * no layout, então elas continuam exigindo sessão.
 */
const isBare = (pathname: string): boolean =>
  pathname === '/entrar' || /\/(imprimir|separacao)$/.test(pathname)

const isActive = (pathname: string, href: string): boolean =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

/**
 * Casca compartilhada do admin: sidebar de navegação + topo com usuário/logout.
 * Antes cada página repetia o próprio header inline — a casca centraliza isso e
 * dá um lugar único para crescer (pedidos, clientes) sem tocar em cada tela.
 */
export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  if (isBare(pathname)) return <>{children}</>

  return (
    <div className="flex min-h-svh bg-muted">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-14 items-center px-6">
          <span className="font-semibold tracking-tight">Arte no Jardim</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
          {/* Navegação enxuta no mobile, onde a sidebar some. */}
          <nav className="flex items-center gap-1 md:hidden">
            {NAV.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  className={cn(
                    'rounded-md p-2',
                    isActive(pathname, item.href)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="size-4" />
                </Link>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex flex-col items-end leading-tight">
              <span className="text-sm">{user?.name}</span>
              <span className="text-xs text-muted-foreground">{user?.role}</span>
            </div>
            <button
              onClick={() => void logout()}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              Sair
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
