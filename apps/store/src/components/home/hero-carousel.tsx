'use client'

import Link from 'next/link'
import Image from 'next/image'
import type { PublicBanner } from '@ecommerce/shared/contracts'
import { SnapCarousel } from '@/components/snap-carousel'
import { StoreLogo } from '@/components/store-logo'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * O carrossel de campanhas do topo da home. Os slides vêm do admin (/banners);
 * sem nenhum cadastrado, um slide padrão sustenta a página — a home nunca abre
 * vazia. Autoplay de 6s (pausa em hover/toque, respeita reduced-motion).
 */

/** O slide que vale enquanto o lojista não cadastrar nenhum banner. */
const DEFAULT_SLIDE: PublicBanner = {
  id: 'default',
  title: 'Velas artesanais e cosmética natural',
  subtitle: 'Rituais de autocuidado e bem estar. Produtos feitos com alma.',
  buttonLabel: 'Ver destaques',
  linkUrl: '#destaques',
  imageUrl: null,
}

export const HeroCarousel = ({
  banners,
  logoUrl,
}: {
  banners: PublicBanner[]
  logoUrl: string | null
}) => {
  const slides = banners.length > 0 ? banners : [DEFAULT_SLIDE]

  return (
    <SnapCarousel
      ariaLabel="Campanhas em destaque"
      showDots={slides.length > 1}
      autoAdvanceMs={6000}
      className="bg-secondary pb-4"
    >
      {slides.map((slide, i) => {
        // O primeiro slide carrega o h1 da página; os demais são h2.
        const Title = i === 0 ? 'h1' : 'h2'

        return (
          <div key={slide.id} className="w-full shrink-0 snap-center">
            <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 pb-8 pt-8 sm:gap-10 sm:pt-10 md:grid-cols-[1.1fr_1fr] lg:pb-12 lg:pt-14">
              {/* Mobile: imagem primeiro (como no layout); desktop: texto à esquerda. */}
              <div className="relative order-1 md:order-2">
                {slide.imageUrl ? (
                  <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-card">
                    <Image
                      src={slide.imageUrl}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 100vw, 45vw"
                      priority={i === 0}
                      className="object-cover"
                    />
                  </div>
                ) : (
                  // Sem foto ainda: composição decorativa nos tons do tema, com
                  // o logo — o mesmo espírito do hero antigo.
                  <div aria-hidden className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-accent/60">
                    <span className="absolute -left-10 -top-10 size-40 rounded-full bg-primary/10" />
                    <span className="absolute -bottom-12 -right-8 size-48 rounded-full bg-secondary/80" />
                    <StoreLogo
                      src={logoUrl}
                      alt=""
                      size={280}
                      priority={i === 0}
                      className="relative size-40 opacity-90 drop-shadow-sm sm:size-52"
                    />
                  </div>
                )}
              </div>

              <div className="order-2 text-center md:order-1 md:text-left">
                <p className="text-xs font-medium uppercase tracking-[0.25em] text-primary-ink sm:text-sm">
                  Feito à mão + com carinho
                </p>
                <Title className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                  {slide.title}
                </Title>
                {slide.subtitle && (
                  <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg md:mx-0">
                    {slide.subtitle}
                  </p>
                )}
                {slide.buttonLabel && slide.linkUrl && (
                  <div className="mt-6">
                    <Link
                      href={slide.linkUrl}
                      className={cn(
                        buttonVariants({ size: 'lg' }),
                        'text-sm font-semibold uppercase tracking-[0.15em]',
                      )}
                    >
                      {slide.buttonLabel}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </SnapCarousel>
  )
}
