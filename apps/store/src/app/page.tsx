import Image from 'next/image'
import Link from 'next/link'
import { HeartHandshake, RefreshCw, ShieldCheck, Truck } from 'lucide-react'
import { listProducts, getCategoryTree } from '@/lib/catalog'
import { ProductCard } from '@/components/product-card'
import { SectionHeading } from '@/components/section-heading'
import { buttonVariants } from '@/components/ui/button'

const BENEFITS = [
  { icon: Truck, title: 'Enviamos para todo o Brasil', text: 'Frete calculado direto no produto.' },
  { icon: HeartHandshake, title: 'Feito à mão, um a um', text: 'Cada peça é única, produzida com carinho.' },
  { icon: ShieldCheck, title: 'Pagamento seguro', text: 'Processado pela Stripe, com criptografia.' },
  { icon: RefreshCw, title: 'Troca fácil', text: 'Até 7 dias para trocar sem complicação.' },
]

/**
 * Home. Server Component com ISR (o revalidate vem do catalog). É a vitrine: o
 * hero e, logo abaixo, as novidades. A navegação por categoria NÃO se repete
 * aqui — ela vive na barra do header, que está em todas as páginas. SEO
 * renderizado no servidor — o Google vê o HTML completo, não um shell vazio.
 */
export default async function HomePage() {
  const [{ data: products }, categories] = await Promise.all([
    listProducts({}),
    getCategoryTree(),
  ])

  // Única categoria que a home usa: o CTA secundário do hero.
  const firstCategory = categories.find((c) => c.isActive)

  return (
    <main>
      {/*
        Hero: composição CSS ecoando os círculos do logo — não há fotografia
        profissional de produto ainda; quando houver, ela entra aqui.
      */}
      <section className="relative overflow-hidden bg-gradient-to-b from-secondary via-background to-background">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="absolute -left-24 -top-24 size-72 rounded-full bg-primary/10" />
          <span className="absolute -right-16 top-1/3 size-56 rounded-full bg-accent/70" />
          <span className="absolute bottom-[-6rem] left-1/3 size-64 rounded-full bg-primary/5" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:py-20 md:grid-cols-[3fr_2fr] lg:py-24">
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-700 md:text-left">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
              Feito à mão · com carinho
            </p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Velas artesanais e cosmética natural
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground md:mx-0">
              Rituais de autocuidado e bem estar. Produtos feitos com alma.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
              <Link href="#novidades" className={buttonVariants({ size: 'lg' })}>
                Ver novidades
              </Link>
              {firstCategory && (
                <Link
                  href={`/categorias/${firstCategory.slug}`}
                  className={buttonVariants({ variant: 'outline', size: 'lg' })}
                >
                  {firstCategory.name}
                </Link>
              )}
            </div>
          </div>

          <div className="hidden justify-center md:flex animate-in fade-in zoom-in-95 duration-1000">
            <Image
              src="/logo-bird.png"
              alt=""
              width={320}
              height={320}
              priority
              className="size-64 opacity-90 drop-shadow-sm lg:size-80"
            />
          </div>
        </div>
      </section>

      <section id="novidades" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-14">
        <SectionHeading
          title="Novidades"
          subtitle="As últimas peças que saíram do ateliê."
        />
        {products.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            Em breve, novos produtos.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.slice(0, 8).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-8 rounded-2xl bg-muted px-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex flex-col items-center gap-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-card shadow-soft">
                <Icon className="size-5 text-primary" strokeWidth={1.8} />
              </span>
              <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sem bloco de newsletter aqui: o footer já tem um, em todas as páginas. */}
    </main>
  )
}
