'use client'

import { Gift } from 'lucide-react'
import type { PublicBanner } from '@ecommerce/shared/contracts'
import { SnapCarousel } from '@/components/snap-carousel'
import { PhotoSlide, SlideText } from './banner-slide'

/**
 * A faixa do meio da home ("Presentear é criar memórias"). Os slides vêm do
 * admin (/banners, "Meio da página"), com os mesmos recursos do topo; sem
 * nenhum cadastrado, vale o manifesto da marca — a seção nunca some.
 */

const defaultSlide = (ctaHref: string): PublicBanner => ({
  id: 'default-middle',
  title: 'Presentear é criar memórias.',
  subtitle:
    'Escolha o presente ideal para cada história. Tudo feito com carinho, para tornar momentos comuns em lembranças inesquecíveis.',
  buttonLabel: 'Conheça mais',
  linkUrl: ctaHref,
  imageUrl: null,
  imageWidth: null,
  imageHeight: null,
  backdrop: null,
  layout: 'SIDE',
  blurBehindText: true,
  placement: 'MIDDLE',
})

export const MiddleBanner = ({ banners, ctaHref }: { banners: PublicBanner[]; ctaHref: string }) => {
  const slides = banners.length > 0 ? banners : [defaultSlide(ctaHref)]

  return (
    <section aria-label={slides[0]?.title} className="mx-auto max-w-6xl px-4 py-10">
      <SnapCarousel
        ariaLabel="Banners do meio da página"
        showDots={slides.length > 1}
        autoAdvanceMs={6000}
        className="overflow-hidden rounded-2xl bg-accent"
        dotsClassName="absolute inset-x-0 bottom-3 mx-auto mt-0 w-fit rounded-full bg-background/70 px-2.5 py-1.5"
      >
        {slides.map((slide, i) => (
          <div key={slide.id} className="flex w-full shrink-0 snap-center">
            {slide.imageUrl ? (
              <PhotoSlide slide={slide} imageUrl={slide.imageUrl} first={i === 0} variant="middle" />
            ) : (
              <DecorSlide slide={slide} />
            )}
          </div>
        ))}
      </SnapCarousel>
    </section>
  )
}

/** Sem foto: a composição decorativa de sempre, nos tons do tema. */
const DecorSlide = ({ slide }: { slide: PublicBanner }) => (
  <div className="grid w-full items-center bg-accent text-accent-foreground md:grid-cols-[1.2fr_1fr]">
    <div className="p-8 sm:p-12">
      <SlideText slide={slide} heading="h2" variant="middle" tone="theme" />
    </div>

    <div aria-hidden className="relative hidden min-h-72 items-center justify-center self-stretch overflow-hidden md:flex">
      <span className="absolute right-8 top-8 size-44 rounded-full bg-card/40" />
      <span className="absolute -bottom-10 left-4 size-56 rounded-full bg-secondary/60" />
      <span className="absolute bottom-16 right-24 size-20 rounded-full bg-primary/10" />
      <Gift className="relative size-20 text-primary-ink/60" strokeWidth={1} />
    </div>
  </div>
)
