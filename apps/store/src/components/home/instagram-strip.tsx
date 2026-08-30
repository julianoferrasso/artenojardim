import Image from 'next/image'
import { Flower2, Heart, Leaf, Sprout, Gift } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'
import { InstagramIcon, INSTAGRAM_PROFILE } from '@/components/brand-icons'
import { cn } from '@/lib/utils'

/**
 * "No Instagram": grade de fotos + faixa de seguir. As fotos são ESTÁTICAS
 * (sem API da Meta — decisão registrada): quando a cliente mandar o material,
 * os arquivos entram em `public/instagram/` e o array abaixo aponta para eles.
 * `src: null` renderiza um tile decorativo nos tons do tema.
 */
const TILES: Array<{ src: string | null; icon: typeof Flower2 }> = [
  { src: null, icon: Flower2 },
  { src: null, icon: Gift },
  { src: null, icon: Leaf },
  { src: null, icon: Heart },
  { src: null, icon: Sprout },
]

export const InstagramStrip = () => (
  <section aria-label="No Instagram" className="mx-auto max-w-6xl px-4 py-10">
    <SectionHeading
      title="No Instagram"
      subtitle="Acompanhe, inspire-se e faça parte do nosso jardim."
    />

    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
      {TILES.map(({ src, icon: Icon }, i) => (
        <a
          key={i}
          href={INSTAGRAM_PROFILE.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Ver o perfil ${INSTAGRAM_PROFILE.handle} no Instagram`}
          className={cn(
            'group relative aspect-square overflow-hidden rounded-xl',
            // 5 tiles não dividem por 3: no mobile os dois últimos saem.
            i >= 3 && 'hidden sm:block',
          )}
        >
          {src ? (
            <Image
              src={src}
              alt=""
              fill
              sizes="(max-width: 640px) 33vw, 20vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <span
              aria-hidden
              className={cn(
                'flex size-full items-center justify-center transition-colors',
                i % 2 === 0 ? 'bg-secondary' : 'bg-accent',
                'group-hover:bg-primary/15',
              )}
            >
              <Icon className="size-8 text-primary-ink/50" strokeWidth={1.2} />
            </span>
          )}
        </a>
      ))}
    </div>

    <a
      href={INSTAGRAM_PROFILE.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-primary px-5 py-3 text-primary-foreground shadow-soft transition-opacity hover:opacity-90"
    >
      <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium">
        <InstagramIcon className="size-5 shrink-0" aria-hidden />
        <span className="truncate">{INSTAGRAM_PROFILE.handle}</span>
      </span>
      <span className="shrink-0 rounded-md border border-primary-foreground/50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.15em]">
        Seguir
      </span>
    </a>
  </section>
)
