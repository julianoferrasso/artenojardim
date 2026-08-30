import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { CategoryTreeNode } from '@ecommerce/shared/contracts'
import { SectionHeading } from '@/components/section-heading'
import { ProductImage } from '@/components/product-image'

/**
 * "Nossos presentes": as 4 primeiras categorias de topo, com a foto cadastrada
 * no admin (Categorias → Imagem). Sem foto, cai no placeholder padrão da loja.
 */
export const CategoryShowcase = ({ categories }: { categories: CategoryTreeNode[] }) => {
  const featured = categories.filter((c) => c.isActive).slice(0, 4)
  if (featured.length === 0) return null

  return (
    <section aria-label="Nossos presentes" className="mx-auto max-w-6xl px-4 py-10">
      <SectionHeading title="Nossos presentes" />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {featured.map((category) => (
          <Link
            key={category.id}
            href={`/categorias/${category.slug}`}
            className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card"
          >
            <div className="relative aspect-square overflow-hidden bg-muted">
              <ProductImage
                src={category.imageUrl}
                alt={category.name}
                fit="cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                className="transition-transform duration-500 group-hover:scale-105"
              />
            </div>
            <div className="flex flex-1 flex-col items-center gap-2 p-5 text-center">
              <h3 className="text-sm font-semibold uppercase tracking-[0.15em]">
                {category.name}
              </h3>
              {category.description && (
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {category.description}
                </p>
              )}
              <span className="mt-auto flex items-center gap-1 pt-1 text-xs font-semibold uppercase tracking-[0.15em] text-primary-ink underline-offset-4 group-hover:underline">
                Ver produtos
                <ArrowRight className="size-3.5" aria-hidden />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
