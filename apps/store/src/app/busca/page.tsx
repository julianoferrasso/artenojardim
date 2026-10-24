import type { Metadata } from 'next'
import { SearchX } from 'lucide-react'
import { listProducts } from '@/lib/catalog'
import { ProductCard } from '@/components/product-card'
import { ReadyFilterChip } from '@/components/ready-filter'

// Busca é sempre dinâmica: a query string é infinita, cachear não faz sentido.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Busca',
  robots: { index: false }, // páginas de resultado não devem indexar
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pronta?: string }>
}) {
  const { q, pronta } = await searchParams
  const term = q?.trim() ?? ''
  const ready = pronta === '1'
  const baseHref = `/busca?q=${encodeURIComponent(term)}`

  const { data: products } = term ? await listProducts({ q: term, ready }) : { data: [] }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-1 font-display text-3xl font-semibold tracking-tight">
        {term ? `Resultados para “${term}”` : 'Buscar'}
      </h1>

      {!term && (
        <p className="mt-4 text-muted-foreground">Digite algo na busca acima.</p>
      )}

      {term && (
        <div className="mt-3 flex items-center gap-2">
          <ReadyFilterChip active={ready} href={ready ? baseHref : `${baseHref}&pronta=1`} />
        </div>
      )}

      {term && products.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-secondary">
            <SearchX className="size-6 text-secondary-foreground" />
          </span>
          <div>
            <p className="font-display text-xl font-semibold">Nada por aqui</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {ready
                ? `Nada a pronta entrega para “${term}” agora. Tire o filtro para ver também o que é feito sob encomenda.`
                : `Nenhum produto encontrado para “${term}”. Tente outra palavra.`}
            </p>
          </div>
        </div>
      )}

      {products.length > 0 && (
        <>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            {products.length} resultado{products.length === 1 ? '' : 's'}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      )}
    </main>
  )
}
