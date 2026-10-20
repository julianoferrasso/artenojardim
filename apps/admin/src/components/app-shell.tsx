'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BellRing,
  LayoutDashboard,
  ShoppingCart,
  Package,
  FolderTree,
  Boxes,
  Images,
  GalleryHorizontalEnd,
  Camera,
  Mail,
  MessagesSquare,
  Palette,
  TicketPercent,
  Truck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { ALERTS_MIN_ROLE, MANAGE_USERS_MIN_ROLE } from '@ecommerce/shared/contracts'
import { ROLE_RANK, type UserRole } from '@ecommerce/shared/constants'
import { useAuth } from '@/lib/auth'
import { useSupportSummary } from '@/lib/support'
import { cn } from '@/lib/utils'

/** `badge` nomeia de onde vem o número do item; hoje só o atendimento tem. */
type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  minRole?: UserRole
  badge?: 'support'
}

/**
 * Ordem = frequência de uso no dia a dia da loja. O Dashboard mora em `/` porque
 * é a primeira coisa que o lojista quer ver ao abrir o painel.
 */
const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pedidos', label: 'Pedidos', icon: ShoppingCart },
  { href: '/atendimento', label: 'Atendimento', icon: MessagesSquare, badge: 'support' },
  // Logo depois de Pedidos: o atendimento abre o cliente a partir do pedido.
  { href: '/clientes', label: 'Clientes', icon: UserRound },
  { href: '/produtos', label: 'Produtos', icon: Package },
  { href: '/categorias', label: 'Categorias', icon: FolderTree },
  { href: '/estoque', label: 'Estoque', icon: Boxes },
  { href: '/uploads', label: 'Biblioteca de mídia', icon: Images },
  // Conteúdo da vitrine, não identidade visual: staff comum edita (Aparência não).
  { href: '/banners', label: 'Banners', icon: GalleryHorizontalEnd },
  // lucide 1.x não traz ícones de marca — a câmera é o "Instagram" do menu.
  { href: '/instagram', label: 'Instagram', icon: Camera },
  // Cupom é preço com outro nome: o mesmo staff que edita produto cria cupom.
  { href: '/cupons', label: 'Cupons', icon: TicketPercent },
  // O disparo mora na tela do produto; aqui fica só o histórico do que saiu.
  { href: '/campanhas', label: 'Campanhas', icon: Mail },
  // Conectar troca a conta que paga os fretes: mesmo piso da API (requireMinRole).
  { href: '/frete', label: 'Frete', icon: Truck, minRole: 'ADMIN' },
  // Mexe na cara da loja inteira: mesmo piso de cargo da gestão de usuários.
  { href: '/aparencia', label: 'Aparência', icon: Palette, minRole: 'ADMIN' },
  { href: '/usuarios', label: 'Usuários', icon: Users, minRole: MANAGE_USERS_MIN_ROLE },
  // Para onde vão os alertas da equipe (e-mail, Telegram, WhatsApp): mesmo piso da API.
  { href: '/alertas', label: 'Alertas', icon: BellRing, minRole: ALERTS_MIN_ROLE },
]

/**
 * Esconder o item do menu é ERGONOMIA, não segurança: quem digitar /usuarios na
 * barra de endereços vê a tela, e a tela leva 403 em cada chamada. Quem impede o
 * acesso é o requireMinRole no router da API — este filtro só evita oferecer a
 * alguém uma porta que não abre.
 *
 * O `role !== undefined` não é paranoia: durante o bootstrap `user` é null, e
 * `ROLE_RANK[undefined] >= 2` seria false por acidente. Melhor não depender do acidente.
 */
const visibleNav = (role: UserRole | undefined): NavItem[] =>
  NAV.filter((i) => !i.minRole || (role !== undefined && ROLE_RANK[role] >= ROLE_RANK[i.minRole]))

/**
 * Rotas sem casca: a tela de login se desenha sozinha, e as telas de impressão
 * viram papel — sidebar e header sairiam na folha. O AuthGuard envolve por fora,
 * no layout, então elas continuam exigindo sessão.
 */
const isBare = (pathname: string): boolean =>
  pathname === '/entrar' || /\/(imprimir|separacao)$/.test(pathname)

const isActive = (pathname: string, href: string): boolean =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

const badgeText = (count: number): string => (count > 99 ? '99+' : String(count))

/**
 * Casca compartilhada do admin: sidebar de navegação + topo com usuário/logout.
 * Antes cada página repetia o próprio header inline — a casca centraliza isso e
 * dá um lugar único para crescer (pedidos, clientes) sem tocar em cada tela.
 */
export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const nav = visibleNav(user?.role)
  const { data: summary } = useSupportSummary()

  // Conversa esperando resposta + cancelamento esperando decisão: o que pede alguém agora.
  const counts: Record<NonNullable<NavItem['badge']>, number> = {
    support: summary?.needsAction ?? 0,
  }
  const countOf = (item: NavItem): number => (item.badge ? counts[item.badge] : 0)

  if (isBare(pathname)) return <>{children}</>

  return (
    <div className="flex min-h-svh bg-muted">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-14 items-center px-6">
          <span className="font-semibold tracking-tight">Arte no Jardim</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          {nav.map((item) => {
            const active = isActive(pathname, item.href)
            const Icon = item.icon
            const count = countOf(item)
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
                {count > 0 && (
                  <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-xs leading-none font-semibold text-destructive-foreground tabular-nums">
                    {badgeText(count)}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
          {/* Navegação enxuta no mobile, onde a sidebar some. Rola sozinha: são
              ícones demais para 390px, e sem isso a página inteira rolava de lado. */}
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto md:hidden">
            {nav.map((item) => {
              const Icon = item.icon
              const count = countOf(item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={count > 0 ? `${item.label} (${count} pendentes)` : item.label}
                  className={cn(
                    'relative rounded-md p-2',
                    isActive(pathname, item.href)
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                >
                  <Icon className="size-4" />
                  {count > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-xs leading-none font-semibold text-destructive-foreground tabular-nums">
                      {badgeText(count)}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-4 pl-3">
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
