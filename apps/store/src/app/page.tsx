import Image from 'next/image'
import Link from 'next/link'
import { HeartHandshake, RefreshCw, ShieldCheck, Truck } from 'lucide-react'
import { listProducts, getCategoryTree } from '@/lib/catalog'
import { ProductCard } from '@/components/product-card'
import { SectionHeading } from '@/components/section-heading'
import { NewsletterForm } from '@/components/newsletter-form'
import { buttonVariants } from '@/components/ui/button'

const BENEFITS = [
  { icon: Truck, title: 'Enviamos para todo o Brasil', text: 'Frete calculado direto no produto.' },
  { icon: HeartHandshake, title: 'Feito à mão, um a um', text: 'Cada peça é única, produzida com carinho.' },
  { icon: ShieldCheck, title: 'Pagamento seguro', text: 'Processado pela Stripe, com criptografia.' },
  { icon: RefreshCw, title: 'Troca fácil', text: 'Até 7 dias para trocar sem complicação.' },
]

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
  const firstCategory = topCategories[0]

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
              Peças artesanais para aquecer a sua casa
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground md:mx-0">
              Velas e objetos únicos, escolhidos e produzidos um a um para deixar cada canto mais
              acolhedor.
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

      {topCategories.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14">
          <SectionHeading
            title="Navegue por categoria"
            subtitle="Encontre a peça certa para cada canto da casa."
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {topCategories.map((cat) => (
              <Link
                key={cat.id}
                href={`/categorias/${cat.slug}`}
                className="group relative flex aspect-square flex-col justify-end overflow-hidden rounded-xl border border-border bg-secondary shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card"
              >
                {cat.imageUrl ? (
                  <>
                    <Image
                      src={cat.imageUrl}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent"
                    />
                    <span className="relative p-3 font-display text-lg font-semibold text-background">
                      {cat.name}
                    </span>
                  </>
                ) : (
                  <span className="flex flex-1 flex-col items-center justify-center gap-2 p-3">
                    <Image src="/logo-bird.png" alt="" width={48} height={48} className="size-12 opacity-70" />
                    <span className="text-center font-display text-lg font-semibold text-secondary-foreground">
                      {cat.name}
                    </span>
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

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

      {/*<section className="mx-auto max-w-6xl px-4 pb-16 pt-2">
        <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-secondary/60 px-6 py-12 text-center">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight">
              Fique por dentro das novidades
            </h2>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
              Receba lançamentos e promoções no seu e-mail. Sem spam, prometido.
            </p>
          </div>
          <NewsletterForm className="max-w-md" />
        </div>
      </section>*/}
    </main>
  )
}
