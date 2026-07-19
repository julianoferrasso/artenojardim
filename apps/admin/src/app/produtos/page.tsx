'use client'

import { useState } from 'react'
import { useProducts } from '@/lib/products'
import { formatBRL, formatDate, cn } from '@/lib/utils'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  ARCHIVED: 'Arquivado',
}

const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ACTIVE: 'bg-success/15 text-success',
  ARCHIVED: 'bg-muted text-muted-foreground line-through',
}

export default function ProductsPage() {
  const [status, setStatus] = useState<string>('')
  const [q, setQ] = useState('')
  const { data, isLoading, error } = useProducts({ status: status || undefined, q: q || undefined })

  return (
    <div className="min-h-svh bg-muted">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <span className="font-semibold tracking-tight">Produtos</span>
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Voltar
          </a>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <input
            placeholder="Buscar por nome…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Todos os status</option>
            <option value="DRAFT">Rascunho</option>
            <option value="ACTIVE">Ativo</option>
            <option value="ARCHIVED">Arquivado</option>
          </select>
          <a
            href="/produtos/novo"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 leading-10"
          >
            Novo produto
          </a>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {error && <p className="text-sm text-destructive">Falha ao carregar produtos.</p>}

        {data && data.data.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum produto {status ? `com status ${STATUS_LABEL[status]}` : 'ainda'}. Crie o primeiro.
          </p>
        )}

        {data && data.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {data.data.map((p) => (
              <li key={p.id}>
                <a
                  href={`/produtos/${p.id}`}
                  className="flex items-center gap-4 rounded-lg border border-border bg-card p-3 hover:border-primary/40"
                >
                  <div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
                    {p.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnailUrl} alt="" className="size-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.variantCount} variaç{p.variantCount === 1 ? 'ão' : 'ões'} ·{' '}
                      {formatDate(p.updatedAt)}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium">
                      {p.priceRange.min === p.priceRange.max
                        ? formatBRL(p.priceRange.min)
                        : `${formatBRL(p.priceRange.min)} – ${formatBRL(p.priceRange.max)}`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded px-2 py-0.5 text-xs font-medium',
                      STATUS_CLASS[p.status],
                    )}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </a>
              </li>
            ))}
            {data.meta.totalPages > 1 && (
              <p className="pt-2 text-center text-xs text-muted-foreground">
                {data.meta.total} produtos · página {data.meta.page} de {data.meta.totalPages}
              </p>
            )}
          </ul>
        )}
      </main>
    </div>
  )
}
