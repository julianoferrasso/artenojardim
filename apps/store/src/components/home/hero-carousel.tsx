'use client'

import type { PublicBanner } from '@ecommerce/shared/contracts'
import { SnapCarousel } from '@/components/snap-carousel'
import { StoreLogo } from '@/components/store-logo'
import { PhotoSlide, SlideText } from './banner-slide'

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
  imageWidth: null,
  imageHeight: null,
  backdrop: null,
  layout: 'SIDE',
  blurBehindText: true,
  placement: 'HERO',
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
      className="bg-secondary"
      // Por cima do slide: embaixo dele, a faixa dos dots ficaria na cor do
      // tema, cortando o fundo que cada slide pinta.
      dotsClassName="absolute inset-x-0 bottom-3 mx-auto mt-0 w-fit rounded-full bg-background/70 px-2.5 py-1.5"
    >
      {slides.map((slide, i) => (
        <div key={slide.id} className="flex w-full shrink-0 snap-center">
          {slide.imageUrl ? (
            <PhotoSlide slide={slide} imageUrl={slide.imageUrl} first={i === 0} variant="hero" />
          ) : (
            <DecorSlide slide={slide} logoUrl={logoUrl} first={i === 0} />
          )}
        </div>
      ))}
    </SnapCarousel>
  )
}

/** Sem foto: composição decorativa nos tons do tema, com o logo. */
const DecorSlide = ({ slide, logoUrl, first }: { slide: PublicBanner; logoUrl: string | null; first: boolean }) => (
  <div className="mx-auto grid w-full max-w-6xl items-center gap-6 px-4 pb-12 pt-8 sm:gap-10 sm:pt-10 md:grid-cols-[1.1fr_1fr] lg:pb-14 lg:pt-14">
    {/* Mobile: imagem primeiro (como no layout); desktop: texto à esquerda. */}
    <div aria-hidden className="relative order-1 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-accent/60 md:order-2">
      <span className="absolute -left-10 -top-10 size-40 rounded-full bg-primary/10" />
      <span className="absolute -bottom-12 -right-8 size-48 rounded-full bg-secondary/80" />
      <StoreLogo
        src={logoUrl}
        alt=""
        size={280}
        priority={first}
        className="relative size-40 opacity-90 drop-shadow-sm sm:size-52"
      />
    </div>

    <SlideText
      slide={slide}
      heading={first ? 'h1' : 'h2'}
      variant="hero"
      tone="theme"
      className="order-2 md:order-1"
    />
  </div>
)
