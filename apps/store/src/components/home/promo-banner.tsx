import Link from 'next/link'
import { Gift } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A faixa rosé "Presentear é criar memórias". Conteúdo fixo — é o manifesto da
 * marca, não campanha (campanha é banner, que vive no admin). A composição
 * decorativa segura o lugar da foto até existir material profissional.
 */
export const PromoBanner = ({ ctaHref }: { ctaHref: string }) => (
  <section aria-label="Presentear é criar memórias" className="mx-auto max-w-6xl px-4 py-10">
    <div className="overflow-hidden rounded-2xl bg-accent text-accent-foreground">
      <div className="grid items-center md:grid-cols-[1.2fr_1fr]">
        <div className="p-8 sm:p-12">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Presentear é criar memórias.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed opacity-80 sm:text-base">
            Escolha o presente ideal para cada história. Tudo feito com carinho, para
            tornar momentos comuns em lembranças inesquecíveis.
          </p>
          <Link
            href={ctaHref}
            className={cn(
              buttonVariants({ size: 'lg' }),
              'mt-6 text-sm font-semibold uppercase tracking-[0.15em]',
            )}
          >
            Conheça mais
          </Link>
        </div>

        <div aria-hidden className="relative hidden min-h-72 items-center justify-center self-stretch md:flex">
          <span className="absolute right-8 top-8 size-44 rounded-full bg-card/40" />
          <span className="absolute -bottom-10 left-4 size-56 rounded-full bg-secondary/60" />
          <span className="absolute bottom-16 right-24 size-20 rounded-full bg-primary/10" />
          <Gift className="relative size-20 text-primary-ink/60" strokeWidth={1} />
        </div>
      </div>
    </div>
  </section>
)
