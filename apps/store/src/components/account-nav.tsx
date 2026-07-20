'use client'

import Link from 'next/link'
import { User } from 'lucide-react'
import { useAuth } from '@/lib/auth'

/**
 * Link de conta no header. Client Component (precisa da sessão), mas pequeno —
 * o resto do header é server. Ícone sempre; o rótulo aparece do md para cima.
 */
export const AccountNav = () => {
  const { customer, loading } = useAuth()

  const href = customer ? '/conta' : '/entrar'
  const label = loading ? '' : customer ? customer.name.split(' ')[0] : 'Entrar'

  return (
    <Link
      href={href}
      aria-label={customer ? 'Minha conta' : 'Entrar'}
      className="flex h-10 items-center gap-2 rounded-full px-2.5 text-foreground transition-colors hover:bg-accent"
    >
      <User className="size-5" strokeWidth={1.8} />
      {label && <span className="hidden text-sm font-medium lg:inline">{label}</span>}
    </Link>
  )
}
