import Link from 'next/link'
import { listProducts, getCategoryTree } from '@/lib/catalog'
import { ProductCard } from '@/components/product-card'

/**
 * Home. Server Component com ISR (o revalidate vem do catalog). Mostra as
 * novidades (últimos produtos ACTIVE) e as categorias. SEO renderizado no
 * servidor — o Google vê o HTML completo, não um shell vazio.
 */
export default async function HomePage() {
  const [{ data: products }, categories] = await Promise.all([
    listProducts({}),
    getCategoryTree(),
  ])

  const topCategories = categories.filter((c) => c.isActive).slice(0, 6)

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <section className="mb-10 rounded-xl bg-secondary px-6 py-12 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Peças que dão vida ao seu jardim
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Vasos e objetos artesanais, feitos à mão, escolhidos um a um.
        </p>
      </section>

      {topCategories.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-medium">Categorias</h2>
          <div className="flex flex-wrap gap-2">
            {topCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/categorias/${cat.slug}`}
                className="rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-medium">Novidades</h2>
        {products.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
            Em breve, novos produtos.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
