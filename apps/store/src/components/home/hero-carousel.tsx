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
  layout: 'SIDE',
  blurBehindText: true,
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
 * Slide com foto. No desktop, o lojista escolhe a posição da foto:
 * - SIDE: presa à direita com a altura do slide e a largura da proporção dela.
 *   Com desfoque, o resto do slide é a cor da borda da foto (suavizada) e a
 *   foto se dissolve nela, desfocando; sem desfoque, corte reto sobre a
 *   secundária do tema.
 * - COVER: a foto cobre o slide. Com desfoque, ela fica desfocada atrás do
 *   texto com um véu na cor dela, sumindo para a direita; sem, fica nítida.
 *
 * No celular empilha em qualquer modo (uma foto larga cobrindo um slide em pé
 * recortaria quase tudo): foto em cima, texto embaixo — sobre a borda de baixo
 * prolongada, com desfoque, ou sobre a secundária, sem.
 */
const PhotoSlide = ({ slide, imageUrl, first }: { slide: PublicBanner; imageUrl: string; first: boolean }) => {
  const ratio = slide.imageWidth && slide.imageHeight ? slide.imageWidth / slide.imageHeight : 4 / 3
  // `??`: resposta antiga da API em cache não tem as chaves — confiar no tipo
  // aqui já derrubou o SSR da home uma vez (o `tertiary` do tema).
  const layout = slide.layout ?? 'SIDE'
  const blur = slide.blurBehindText ?? true
  const cover = layout === 'COVER'
  const vars = deriveBannerVars({ layout, blur, backdrop: slide.backdrop ?? null })
  const has = (name: string) => name in vars

  const style = {
    ...vars,
    '--photo-ratio': ratio,
    // No celular a foto ocupa a largura toda: quadrada viraria uma tela inteira
    // de foto, e uma 3:1 uma tira. Trava entre 4:3 e 16:9 e recorta o resto.
    '--photo-ratio-sm': Math.min(16 / 9, Math.max(4 / 3, ratio)),
  } as CSSProperties

  const sizes = cover
    ? '100vw'
    : `(min-width: 768px) min(100vw, ${Math.ceil(DESKTOP_HEIGHT_PX * ratio)}px), 100vw`

  return (
    <div
      style={style}
      className={cn(
        'relative flex w-full flex-col overflow-hidden md:min-h-112 md:flex-row md:items-center lg:min-h-120',
        has('--hero-bg') ? 'bg-(image:--hero-bg) text-(--hero-ink)' : 'bg-secondary text-secondary-foreground',
        // bg-none: sem fundo prolongado no desktop, o degradê do celular não vaza.
        has('--hero-bg-md') ? 'md:bg-(image:--hero-bg-md)' : 'md:bg-secondary md:bg-none',
        has('--hero-ink-md') ? 'md:text-(--hero-ink-md)' : 'md:text-secondary-foreground',
      )}
    >
      <div
        className={cn(
          'relative w-full overflow-hidden aspect-(--photo-ratio-sm)',
          cover
            ? 'md:absolute md:inset-0 md:aspect-auto md:h-full'
            : // h-full explícito: só com inset-y, quando o max-w-full trava a largura
              // de uma foto larga o aspect-ratio recalcula a ALTURA e a foto encolhe.
              'md:absolute md:inset-y-0 md:right-0 md:h-full md:w-auto md:max-w-full md:aspect-(--photo-ratio)',
          blur && 'max-md:mask-fade-b',
          blur && !cover && 'md:mask-fade-l',
        )}
      >
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes={sizes}
          priority={first}
          // Mais larga que o espaço: recorta pela esquerda, onde fica o texto,
          // e preserva o assunto da foto.
          className="object-cover object-right"
        />

        {blur && (
          <>
            {/* O desfoque é uma CÓPIA da foto (mesma URL, baixada uma vez), não
                backdrop-filter: a máscara do contêiner isola o fundo, e o filtro
                não enxergaria a foto. scale-110 esconde a franja clara que o
                blur cria nas bordas. */}
            <Image
              src={imageUrl}
              alt=""
              fill
              sizes={sizes}
              aria-hidden
              className={cn(
                'scale-110 object-cover object-right max-md:mask-blur-b',
                cover ? 'blur-2xl md:mask-veil-l' : 'blur-xl md:mask-blur-l',
              )}
            />
            {cover && has('--hero-tint') && (
              <div aria-hidden className="absolute inset-0 hidden bg-(--hero-tint) md:block md:mask-veil-l" />
            )}
          </>
        )}
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
