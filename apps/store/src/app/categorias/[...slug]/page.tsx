import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { listProducts, getCategoryTree } from '@/lib/catalog'
import { ProductCard } from '@/components/product-card'
import type { CategoryTreeNode } from '@ecommerce/shared/contracts'

/** Acha a categoria pelo último segmento do caminho (…/vasos/ceramica → ceramica). */
const findBySlug = (nodes: CategoryTreeNode[], slug: string): CategoryTreeNode | undefined => {
  for (const n of nodes) {
    if (n.slug === slug) return n
    const found = findBySlug(n.children, slug)
    if (found) return found
  }
  return undefined
}

type Params = { slug: string[] }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const leaf = slug[slug.length - 1]!
  const category = findBySlug(await getCategoryTree(), leaf)
  if (!category) return { title: 'Categoria' }
  return {
    title: category.seoTitle ?? category.name,
    description: category.seoDescription ?? category.description ?? undefined,
  }
}

export default async function CategoryPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const leaf = slug[slug.length - 1]!

  const tree = await getCategoryTree()
  const category = findBySlug(tree, leaf)
  if (!category || !category.isActive) notFound()

  const { data: products } = await listProducts({ category: category.id })

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-4 text-sm text-muted-foreground">
        <a href="/" className="hover:text-foreground">
          Início
        </a>
        <span className="mx-2">/</span>
        <span className="text-foreground">{category.name}</span>
      </nav>

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{category.name}</h1>
      {category.description && (
        <p className="mb-6 max-w-2xl text-muted-foreground">{category.description}</p>
      )}

      {category.children.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {category.children
            .filter((c) => c.isActive)
            .map((c) => (
              <a
                key={c.id}
                href={`/categorias/${c.slug}`}
                className="rounded-full border border-border px-3 py-1 text-sm hover:bg-accent"
              >
                {c.name}
              </a>
            ))}
        </div>
      )}

      {products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          Nenhum produto nesta categoria ainda.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </main>
  )
}
