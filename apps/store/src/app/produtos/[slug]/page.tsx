import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getProduct } from '@/lib/catalog'
import { ApiError } from '@/lib/api'
import { ProductDetail } from '@/components/product-detail'
import { ProductViewBeacon } from './product-view-beacon'
import { formatBRL } from '@/lib/utils'

type Params = { slug: string }

const load = async (slug: string) => {
  try {
    return await getProduct(slug)
  } catch (err) {
    // Produto inexistente ou DRAFT (a API devolve 404 ao público) → página 404.
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const product = await load(slug)
  if (!product) return { title: 'Produto não encontrado' }

  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.shortDescription ?? undefined,
    openGraph: {
      title: product.seoTitle ?? product.name,
      description: product.seoDescription ?? product.shortDescription ?? undefined,
      images: product.images[0] ? [{ url: product.images[0].url }] : undefined,
      type: 'website',
    },
  }
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const product = await load(slug)
  if (!product) notFound()

  // JSON-LD Product/Offer: é o que faz o Google mostrar preço e disponibilidade
  // direto no resultado de busca. `lowPrice/highPrice` da faixa de variantes.
  const inStock = product.variants.some((v) => v.isActive)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? undefined,
    image: product.images.map((i) => i.url),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'BRL',
      lowPrice: (product.priceRange.min / 100).toFixed(2),
      highPrice: (product.priceRange.max / 100).toFixed(2),
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="mb-6 text-sm text-muted-foreground">
        <a href="/" className="transition-colors hover:text-foreground">
          Início
        </a>
        <span className="mx-2">/</span>
        <span className="text-foreground">{product.name}</span>
      </nav>

      <ProductViewBeacon slug={product.slug} />

      <ProductDetail product={product} />

      {/* Descrição fica no Server Component: é texto longo e estático, não
          precisa viajar como JS dentro do payload do cliente. */}
      {product.shortDescription && (
        <p className="mt-8 text-sm text-muted-foreground">{product.shortDescription}</p>
      )}
      {product.description && (
        <div className="prose prose-sm mt-2 max-w-none text-foreground">
          <p className="whitespace-pre-wrap">{product.description}</p>
        </div>
      )}

      <noscript>
        {/* Sem JS o seletor não interage, mas o preço aparece para SEO/acessível. */}
        <p className="mt-4 text-lg font-semibold">
          A partir de {formatBRL(product.priceRange.min)}
        </p>
      </noscript>
    </main>
  )
}
