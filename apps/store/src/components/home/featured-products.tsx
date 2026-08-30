import type { ProductListItem } from '@ecommerce/shared/contracts'
import { SectionHeading } from '@/components/section-heading'
import { SnapCarousel } from '@/components/snap-carousel'
import { ProductCard } from '@/components/product-card'

/**
 * "Destaques": carrossel dos produtos que o lojista marcou com a estrela no
 * admin. Setas + swipe, sem autoplay — quem navega produto quer controle.
 * Os cards são Server Components passados como children da ilha client.
 */
export const FeaturedProducts = ({ products }: { products: ProductListItem[] }) => {
  if (products.length === 0) return null

  return (
    <section id="destaques" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10">
      <SectionHeading title="Destaques" subtitle="Os queridinhos do ateliê, escolhidos a dedo." />

      <SnapCarousel ariaLabel="Produtos em destaque" showArrows trackClassName="-mx-2 pb-1">
        {products.map((product) => (
          <div key={product.id} className="w-full shrink-0 snap-start px-2 sm:w-1/2 lg:w-1/4">
            <ProductCard product={product} showcase />
          </div>
        ))}
      </SnapCarousel>
    </section>
  )
}
