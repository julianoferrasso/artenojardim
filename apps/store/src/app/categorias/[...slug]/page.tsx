import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { listProducts, getCategoryTree } from '@/lib/catalog'
import { ProductCard } from '@/components/product-card'
import { ReadyFilterChip } from '@/components/ready-filter'
import type { CategoryTreeNode } from '@ecommerce/shared/contracts'
import { buttonVariants } from '@/components/ui/button'

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

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<{ pronta?: string }>
}) {
  const { slug } = await params
  const { pronta } = await searchParams
  const ready = pronta === '1'
  const leaf = slug[slug.length - 1]!

  const tree = await getCategoryTree()
  const category = findBySlug(tree, leaf)
  if (!category || !category.isActive) notFound()

  const { data: products } = await listProducts({ category: category.id, ready })
  const basePath = `/categorias/${slug.join('/')}`

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <nav className="mb-4 text-sm text-muted-foreground">
        <a href="/" className="transition-colors hover:text-foreground">
          Início
        </a>
        <span className="mx-2">/</span>
        <span className="text-foreground">{category.name}</span>
      </nav>

      <h1 className="mb-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {category.name}
      </h1>
      <span aria-hidden className="mt-2 mb-3 block h-0.5 w-12 rounded-full bg-primary/60" />
      {category.description && (
        <p className="mb-6 max-w-2xl text-muted-foreground">{category.description}</p>
      )}

      {category.children.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2">
          {category.children
            .filter((c) => c.isActive)
            .map((c) => (
              <a
                key={c.id}
                href={`/categorias/${c.slug}`}
                className={buttonVariants({ variant: 'neutral', emphasis: 'quiet', size: 'sm' })}
              >
                {c.name}
              </a>
            ))}
        </div>
      )}

      <div className="mb-5 flex items-center gap-2">
        <ReadyFilterChip active={ready} href={ready ? basePath : `${basePath}?pronta=1`} />
      </div>

      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-muted-foreground">
          {ready ? (
            <>
              Nada a pronta entrega nesta categoria agora.{' '}
              <a href={basePath} className="font-medium text-primary-ink underline-offset-4 hover:underline">
                Ver tudo, inclusive sob encomenda
              </a>
            </>
          ) : (
            'Nenhum produto nesta categoria ainda.'
          )}
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
