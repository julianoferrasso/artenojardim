'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth'

/**
 * Link de conta no header. Client Component (precisa da sessão), mas pequeno —
 * o resto do header é server. Mostra "Entrar" ou o nome do cliente.
 */
export const AccountNav = () => {
  const { customer, loading } = useAuth()

  if (loading) return <span className="w-16 text-sm text-muted-foreground">…</span>

  if (!customer) {
    return (
      <Link href="/entrar" className="text-sm text-muted-foreground hover:text-foreground">
        Entrar
      </Link>
    )
  }

  return (
    <Link href="/conta" className="text-sm font-medium hover:text-foreground">
      {customer.name.split(' ')[0]}
    </Link>
  )
}
