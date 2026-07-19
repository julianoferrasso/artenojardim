'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'

/**
 * Painel do cliente. Nesta fase: perfil + sair. Pedidos e endereços entram nas
 * Fases 1.9/1.17, quando existirem. O guard é conveniência de UX (a proteção
 * real é a API); redireciona quem não tem sessão para /entrar.
 */
export default function ContaPage() {
  const { customer, loading, logout } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !customer) router.replace('/entrar')
  }, [loading, customer, router])

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center text-muted-foreground">Carregando…</main>
    )
  }
  if (!customer) return null

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Minha conta</h1>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
        <div>
          <p className="text-sm text-muted-foreground">Nome</p>
          <p className="font-medium">{customer.name}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">E-mail</p>
          <p className="font-medium">{customer.email}</p>
        </div>
      </div>

      <nav className="mt-6 flex flex-col gap-2">
        <Link
          href="/conta/enderecos"
          className="flex items-center justify-between rounded-lg border border-border bg-card px-6 py-4 text-sm font-medium hover:bg-accent"
        >
          Endereços
          <span className="text-muted-foreground">→</span>
        </Link>
      </nav>

      <section className="mt-6 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Seus pedidos aparecerão aqui.
      </section>

      <button
        onClick={() => void logout().then(() => router.replace('/'))}
        className="mt-6 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
      >
        Sair
      </button>
    </main>
  )
}
