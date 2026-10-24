import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { Product, ProductListItem } from '@ecommerce/shared/contracts'
import { getProduct, getStore, listProducts } from '@/lib/catalog'
import { ApiError } from '@/lib/api'
import { ProductDetail } from '@/components/product-detail'
import { ProductCard } from '@/components/product-card'
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

const ALTERNATIVES = 4

/**
 * O que mostrar quando o produto inteiro esgotou: disponíveis da mesma
 * categoria — a mesma URL da página de categoria, então o mesmo cache —, ou da
 * loja toda quando a categoria não tem nenhum. Nunca um beco sem saída.
 */
const loadAlternatives = async (product: Product): Promise<ProductListItem[]> => {
  const pick = (items: ProductListItem[]) =>
    items.filter((p) => p.id !== product.id && p.stockStatus !== 'OUT_OF_STOCK').slice(0, ALTERNATIVES)
  try {
    const categoryId = product.categoryIds[0]
    const fromCategory = categoryId ? pick((await listProducts({ category: categoryId })).data) : []
    return fromCategory.length > 0 ? fromCategory : pick((await listProducts({})).data)
  } catch {
    // Alternativa é bônus: a página do produto não pode cair por causa dela.
    return []
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

  const soldOut = product.stockStatus === 'OUT_OF_STOCK'
  // getStore() também roda no layout; o cache de request do Next deduplica.
  const [alternatives, store] = await Promise.all([
    soldOut ? loadAlternatives(product) : Promise.resolve([]),
    getStore().catch(() => null),
  ])

  // JSON-LD Product/Offer: é o que faz o Google mostrar preço e disponibilidade
  // direto no resultado de busca. `lowPrice/highPrice` da faixa de variantes. A
  // disponibilidade tem que ser a mesma que a tela mostra — divergir vira aviso
  // no Search Console e tira o produto dos resultados ricos. Sob encomenda é
  // BackOrder ("encomendável, sai depois"): o Google não aceita MadeToOrder, e
  // OutOfStock tiraria do resultado um produto que dá para comprar.
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
      availability: soldOut
        ? 'https://schema.org/OutOfStock'
        : product.stockStatus === 'MADE_TO_ORDER'
          ? 'https://schema.org/BackOrder'
          : 'https://schema.org/InStock',
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

      <ProductDetail
        product={product}
        hasAlternatives={alternatives.length > 0}
        handlingDays={store?.handlingDays ?? null}
      />

      {/* Logo abaixo da área de compra, e não depois da descrição: quem achou o
          produto esgotado precisa ver a saída sem rolar a página inteira. */}
      {alternatives.length > 0 && (
        <section id="alternativas" className="mt-12 scroll-mt-24">
          <h2 className="font-display text-2xl font-semibold tracking-tight">Você também pode gostar</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            {alternatives.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}

      {/* Descrição fica no Server Component: é texto longo e estático, não
          precisa viajar como JS dentro do payload do cliente. */}
      {product.shortDescription && (
        <p className="mt-8 text-sm text-muted-foreground">{product.shortDescription}</p>
      )}
      {/* HTML saneado pela API na gravação (utils/rich-text.ts) — lá é a única
          barreira; aqui não se saneia de novo. */}
      {product.description && (
        <div
          className="rich-text mt-2 text-sm text-foreground"
          dangerouslySetInnerHTML={{ __html: product.description }}
        />
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
