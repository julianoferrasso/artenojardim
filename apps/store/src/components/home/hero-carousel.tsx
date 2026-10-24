'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { PublicBanner } from '@ecommerce/shared/contracts'
import { deriveBannerVars } from '@ecommerce/shared/utils'
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
  imageWidth: null,
  imageHeight: null,
  backdrop: null,
}

/** Altura mínima do slide no lg (`lg:min-h-120`): a base do `sizes` da foto. */
const DESKTOP_HEIGHT_PX = 480

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
            <PhotoSlide slide={slide} imageUrl={slide.imageUrl} first={i === 0} />
          ) : (
            <DecorSlide slide={slide} logoUrl={logoUrl} first={i === 0} />
          )}
        </div>
      ))}
    </SnapCarousel>
  )
}

/**
 * Slide com foto. A foto fica presa à direita com a altura toda do slide e a
 * largura da proporção dela; o resto é pintado com a cor da borda da foto
 * (amostrada no admin), e a borda da foto se dissolve nessa cor. Quadrada, o
 * texto cai sobre a cor prolongada; bem larga, a própria foto chega por trás do
 * texto — a geometria decide, sem limiar de proporção.
 *
 * No celular empilha: foto em cima, texto embaixo sobre a borda de BAIXO.
 */
const PhotoSlide = ({ slide, imageUrl, first }: { slide: PublicBanner; imageUrl: string; first: boolean }) => {
  const ratio = slide.imageWidth && slide.imageHeight ? slide.imageWidth / slide.imageHeight : 4 / 3
  // `?? null`: resposta antiga da API em cache não tem a chave — confiar no
  // tipo aqui já derrubou o SSR da home uma vez (o `tertiary` do tema).
  const backdrop = slide.backdrop ?? null

  const style = {
    ...(backdrop ? deriveBannerVars(backdrop) : {}),
    '--photo-ratio': ratio,
    // No celular a foto ocupa a largura toda: quadrada viraria uma tela inteira
    // de foto, e uma 3:1 uma tira. Trava entre 4:3 e 16:9 e recorta o resto.
    '--photo-ratio-sm': Math.min(16 / 9, Math.max(4 / 3, ratio)),
  } as CSSProperties

  return (
    <div
      style={style}
      className={cn(
        'relative flex w-full flex-col overflow-hidden md:min-h-112 md:flex-row md:items-center lg:min-h-120',
        backdrop
          ? 'bg-(image:--hero-bg) text-(--hero-ink) md:bg-(image:--hero-bg-md) md:text-(--hero-ink-md)'
          : 'bg-secondary text-secondary-foreground',
      )}
    >
      <div
        className={cn(
          'relative w-full aspect-(--photo-ratio-sm) mask-b-from-75%',
          // h-full explícito: só com inset-y, quando o max-w-full trava a largura
          // de uma foto larga o aspect-ratio recalcula a ALTURA e a foto encolhe.
          'md:absolute md:inset-y-0 md:right-0 md:h-full md:w-auto md:max-w-full md:aspect-(--photo-ratio)',
          'md:mask-b-from-100% md:mask-l-from-80%',
        )}
      >
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes={`(min-width: 768px) min(100vw, ${Math.ceil(DESKTOP_HEIGHT_PX * ratio)}px), 100vw`}
          priority={first}
          // Mais larga que a tela: recorta pela esquerda, onde fica o espaço do
          // texto, e preserva o assunto da foto.
          className="object-cover object-right"
        />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-6 md:py-12">
        <SlideText slide={slide} first={first} tone="inherit" className="md:w-1/2 lg:max-w-xl" />
      </div>
    </div>
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

    <SlideText slide={slide} first={first} tone="theme" className="order-2 md:order-1" />
  </div>
)

/**
 * O texto do slide. `theme` usa as tintas do tema (fundo decorativo); `inherit`
 * herda a cor do slide, que sai do contraste com o fundo prolongado — a
 * `primary-ink` e a `muted-foreground` foram medidas contra as superfícies do
 * tema, não contra a cor da foto, e podiam sumir sobre ela.
 */
const SlideText = ({
  slide,
  first,
  tone,
  className,
}: {
  slide: PublicBanner
  first: boolean
  tone: 'theme' | 'inherit'
  className?: string
}) => {
  // O primeiro slide carrega o h1 da página; os demais são h2.
  const Title = first ? 'h1' : 'h2'

  return (
    <div className={cn('text-center md:text-left', className)}>
      <p
        className={cn(
          'text-xs font-medium uppercase tracking-[0.25em] sm:text-sm',
          tone === 'theme' && 'text-primary-ink',
        )}
      >
        Feito à mão + com carinho
      </p>
      <Title className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
        {slide.title}
      </Title>
      {slide.subtitle && (
        <p
          className={cn(
            'mx-auto mt-4 max-w-xl text-base sm:text-lg md:mx-0',
            tone === 'theme' && 'text-muted-foreground',
          )}
        >
          {slide.subtitle}
        </p>
      )}
      {slide.buttonLabel && slide.linkUrl && (
        <div className="mt-6">
          <Link
            href={slide.linkUrl}
            className={cn(buttonVariants({ size: 'lg' }), 'text-sm font-semibold uppercase tracking-[0.15em]')}
          >
            {slide.buttonLabel}
          </Link>
        </div>
      )}
    </div>
  )
}
