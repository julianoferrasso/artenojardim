'use client'

import { useAuth } from '@/lib/auth'

/**
 * Shell mínimo da Fase 1, item 1. As telas reais (produtos, pedidos, estoque)
 * entram nos itens seguintes — cada uma depende do módulo dela na API.
 */
export default function AdminHomePage() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-svh bg-muted">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <span className="font-semibold tracking-tight">Arte no Jardim</span>

          <div className="flex items-center gap-4">
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
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-8">
          <span className="w-fit rounded-md bg-secondary px-3 py-1 text-xs text-secondary-foreground">
            Fase 1 · item 1 de 18
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Autenticação pronta</h1>
          <p className="text-sm text-muted-foreground">
            Sessão ativa com refresh transparente. As próximas telas chegam com os módulos:
            categorias, produtos, estoque e pedidos.
          </p>

          <nav className="flex flex-wrap gap-2">
            <a
              href="/produtos"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Produtos
            </a>
            <a
              href="/estoque"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Estoque
            </a>
            <a
              href="/categorias"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Categorias
            </a>
            <a
              href="/uploads"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Biblioteca de mídia
            </a>
          </nav>
        </div>
      </main>
    </div>
  )
}
