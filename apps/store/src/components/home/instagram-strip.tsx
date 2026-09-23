import Image from 'next/image'
import { Flower2, Heart, Leaf, Sprout, Gift } from 'lucide-react'
import type { PublicInstagramPost } from '@ecommerce/shared/contracts'
import { SectionHeading } from '@/components/section-heading'
import { InstagramIcon, INSTAGRAM_PROFILE } from '@/components/brand-icons'
import { cn } from '@/lib/utils'

/**
 * "No Instagram": grade de fotos + faixa de seguir. Os posts vêm do admin
 * (menu Instagram), já na ordem que o lojista arrastou; a imagem é re-hospedada
 * no nosso storage — sem API da Meta. Com menos de 5 posts, os tiles
 * decorativos completam a grade para o layout não quebrar.
 */

// Mudou a quantidade? Ajuste STORE_VISIBLE no admin (apps/admin/src/app/instagram/page.tsx).
const DECORATIVE = [Flower2, Gift, Leaf, Heart, Sprout]

type Tile =
  | { kind: 'post'; post: PublicInstagramPost }
  | { kind: 'decorative'; icon: typeof Flower2 }

const tileClass = (i: number) =>
  cn(
    'group relative aspect-square overflow-hidden rounded-xl',
    // 5 tiles não dividem por 3: no mobile os dois últimos saem.
    i >= 3 && 'hidden sm:block',
  )

export const InstagramStrip = ({ posts }: { posts: PublicInstagramPost[] }) => {
  const tiles: Tile[] = DECORATIVE.map((icon, i) => {
    const post = posts[i]
    return post ? { kind: 'post', post } : { kind: 'decorative', icon }
  })

  return (
    <section aria-label="No Instagram" className="mx-auto max-w-6xl px-4 py-10">
      <SectionHeading
        title="No Instagram"
        subtitle="Acompanhe, inspire-se e faça parte do nosso jardim."
      />

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {tiles.map((tile, i) =>
          tile.kind === 'post' ? (
            <a
              key={tile.post.id}
              href={tile.post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Ver este post no Instagram"
              className={tileClass(i)}
            >
              <Image
                src={tile.post.imageUrl}
                alt={tile.post.caption ?? ''}
                fill
                sizes="(max-width: 640px) 33vw, 20vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </a>
          ) : (
            <a
              key={`decorative-${i}`}
              href={INSTAGRAM_PROFILE.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ver o perfil ${INSTAGRAM_PROFILE.handle} no Instagram`}
              className={tileClass(i)}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-full items-center justify-center transition-colors',
                  i % 2 === 0 ? 'bg-secondary' : 'bg-accent',
                  'group-hover:bg-primary/15',
                )}
              >
                <tile.icon className="size-8 text-primary-ink/50" strokeWidth={1.2} />
              </span>
            </a>
          ),
        )}
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
}
