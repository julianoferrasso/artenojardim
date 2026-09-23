import {
  getBanners,
  getCategoryTree,
  getInstagramPosts,
  getStore,
  listFeaturedProducts,
  listProducts,
} from '@/lib/catalog'
import { HeroCarousel } from '@/components/home/hero-carousel'
import { BenefitsStrip } from '@/components/home/benefits-strip'
import { CategoryShowcase } from '@/components/home/category-showcase'
import { PromoBanner } from '@/components/home/promo-banner'
import { TrustBar } from '@/components/home/trust-bar'
import { FeaturedProducts } from '@/components/home/featured-products'
import { InstagramStrip } from '@/components/home/instagram-strip'

/**
 * Home. Server Component com ISR (o revalidate vem do catalog). É a vitrine no
 * desenho do layout da cliente: hero (banners do admin) → benefícios →
 * categorias → banner institucional → confiança → destaques → Instagram.
 * A navegação por categoria NÃO se repete aqui — ela vive no header. SEO
 * renderizado no servidor — o Google vê o HTML completo, não um shell vazio.
 */
export default async function HomePage() {
  // getStore() também roda no layout; o cache de request do Next deduplica.
  const [banners, { data: featured }, categories, store, instagramPosts] = await Promise.all([
    getBanners().catch(() => []),
    listFeaturedProducts().catch(() => ({ data: [] })),
    getCategoryTree(),
    getStore().catch(() => null),
    getInstagramPosts().catch(() => []),
  ])

  // Sem nenhum produto estrelado, a seção mostra os mais recentes — ela nunca
  // some enquanto o lojista não marcar os destaques no admin.
  const highlight =
    featured.length > 0
      ? featured
      : await listProducts({}).then((r) => r.data.slice(0, 8)).catch(() => [])

  const firstCategory = categories.find((c) => c.isActive)
  const badgeStyle = store?.theme?.badgeStyle ?? 'filled'

  return (
    <main>
      <HeroCarousel banners={banners} logoUrl={store?.theme?.logoUrl ?? null} />
      <BenefitsStrip badgeStyle={badgeStyle} />
      <CategoryShowcase categories={categories} />
      <PromoBanner ctaHref={firstCategory ? `/categorias/${firstCategory.slug}` : '/'} />
      <TrustBar />
      <FeaturedProducts products={highlight} />
      <InstagramStrip posts={instagramPosts} />
      {/* Sem bloco de newsletter aqui: o footer já tem um, em todas as páginas. */}
    </main>
  )
}
