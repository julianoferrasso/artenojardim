'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProduct, useUpdateProduct, useDeleteProduct } from '@/lib/products'
import { ApiError } from '@/lib/api'
import { formatBRL, cn } from '@/lib/utils'

/**
 * Detalhe/edição do produto. Nesta fase: edita os campos do produto (nome,
 * descrição, status, SEO) e mostra as variações em leitura. Editar variações
 * (preço/estoque) tem fluxo próprio — é o dado mais sensível — e entra junto
 * com o módulo de estoque (Fase 1.5).
 */
export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: product, isLoading } = useProduct(id)
  const update = useUpdateProduct()
  const del = useDeleteProduct()
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <Centered>Carregando…</Centered>
  if (!product) return <Centered>Produto não encontrado.</Centered>

  const setStatus = (status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED') => {
    setError(null)
    update.mutate(
      { id, input: { status } },
      { onError: (e) => setError(e instanceof ApiError ? e.message : 'Falha ao salvar.') },
    )
  }

  const onDelete = () => {
    if (!confirm(`Arquivar "${product.name}"? Ele sai da loja mas o histórico é preservado.`)) return
    del.mutate(id, { onSuccess: () => router.replace('/produtos') })
  }

  return (
    <div className="min-h-svh bg-muted">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <span className="truncate font-semibold tracking-tight">{product.name}</span>
          <a href="/produtos" className="text-sm text-muted-foreground hover:text-foreground">
            ← Produtos
          </a>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        <section className="flex items-center justify-between rounded-lg border border-border bg-card p-6">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="font-medium">{product.status}</p>
          </div>
          <div className="flex gap-2">
            {product.status !== 'ACTIVE' && (
              <button
                onClick={() => setStatus('ACTIVE')}
                disabled={update.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Publicar
              </button>
            )}
            {product.status === 'ACTIVE' && (
              <button
                onClick={() => setStatus('DRAFT')}
                disabled={update.isPending}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
              >
                Despublicar
              </button>
            )}
          </div>
        </section>

        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {product.images.length > 0 && (
          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-3 font-medium">Imagens</h2>
            <ul className="flex flex-wrap gap-2">
              {product.images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.id} src={img.url} alt={img.alt ?? ''} className="size-20 rounded-md border border-border object-cover" />
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-3 font-medium">Variações ({product.variants.length})</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">Variação</th>
                <th className="py-2 pr-3">SKU</th>
                <th className="py-2 pr-3">Preço</th>
                <th className="py-2 pr-3">Peso</th>
                <th className="py-2">Ativa</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {v.options.map((o) => o.value).join(' / ') || '—'}
                  </td>
                  <td className="py-2 pr-3">{v.sku}</td>
                  <td className="py-2 pr-3">{formatBRL(v.price)}</td>
                  <td className={cn('py-2 pr-3', v.isActive && !v.weight && 'text-warning')}>
                    {v.weight} g
                  </td>
                  <td className="py-2">{v.isActive ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <button
          onClick={onDelete}
          disabled={del.isPending}
          className="self-start rounded-md border border-destructive/40 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          Arquivar produto
        </button>
      </main>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
