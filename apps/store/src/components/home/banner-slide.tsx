import type { CSSProperties } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { PublicBanner } from '@ecommerce/shared/contracts'
import { deriveBannerVars } from '@ecommerce/shared/utils'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * O slide com foto e o texto do slide, comuns ao carrossel do topo e à faixa do
 * meio da home. O que muda entre os dois é a escala: o topo ocupa a largura da
 * tela e carrega o h1; o meio é um cartão dentro do `max-w-6xl`, sempre h2.
 */

export type BannerVariant = 'hero' | 'middle'

/** Altura mínima do slide no lg: a base do `sizes` da foto. */
const DESKTOP_HEIGHT_PX: Record<BannerVariant, number> = { hero: 480, middle: 384 }
/** Largura do cartão do meio no desktop (`max-w-6xl` menos o `px-4`). */
const MIDDLE_WIDTH_PX = 1120

const VARIANT = {
  hero: {
    height: 'md:min-h-112 lg:min-h-120',
    text: 'mx-auto w-full max-w-6xl px-4 pb-12 pt-6 md:py-12',
    textBox: 'md:w-1/2 lg:max-w-xl',
  },
  middle: {
    height: 'md:min-h-80 lg:min-h-96',
    text: 'w-full px-8 pb-10 pt-6 sm:px-12 md:py-12',
    textBox: 'md:w-1/2 lg:max-w-md',
  },
} satisfies Record<BannerVariant, Record<string, string>>

const photoSizes = (variant: BannerVariant, cover: boolean, ratio: number): string => {
  const sideWidth = Math.ceil(DESKTOP_HEIGHT_PX[variant] * ratio)
  if (variant === 'hero') {
    return cover ? '100vw' : `(min-width: 768px) min(100vw, ${sideWidth}px), 100vw`
  }
  return cover
    ? `(min-width: 1152px) ${MIDDLE_WIDTH_PX}px, 100vw`
    : `(min-width: 768px) min(100vw, ${Math.min(MIDDLE_WIDTH_PX, sideWidth)}px), 100vw`
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
export const PhotoSlide = ({
  slide,
  imageUrl,
  first,
  variant,
}: {
  slide: PublicBanner
  imageUrl: string
  first: boolean
  variant: BannerVariant
}) => {
  const ratio = slide.imageWidth && slide.imageHeight ? slide.imageWidth / slide.imageHeight : 4 / 3
  // `??`: resposta antiga da API em cache não tem as chaves — confiar no tipo
  // aqui já derrubou o SSR da home uma vez (o `tertiary` do tema).
  const layout = slide.layout ?? 'SIDE'
  const blur = slide.blurBehindText ?? true
  const cover = layout === 'COVER'
  const vars = deriveBannerVars({ layout, blur, backdrop: slide.backdrop ?? null })
  const has = (name: string) => name in vars
  const sizes = photoSizes(variant, cover, ratio)

  const style = {
    ...vars,
    '--photo-ratio': ratio,
    // No celular a foto ocupa a largura toda: quadrada viraria uma tela inteira
    // de foto, e uma 3:1 uma tira. Trava entre 4:3 e 16:9 e recorta o resto.
    '--photo-ratio-sm': Math.min(16 / 9, Math.max(4 / 3, ratio)),
  } as CSSProperties

  return (
    <div
      style={style}
      className={cn(
        'relative flex w-full flex-col overflow-hidden md:flex-row md:items-center',
        VARIANT[variant].height,
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
          priority={first && variant === 'hero'}
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

      <div className={cn('relative', VARIANT[variant].text)}>
        <SlideText
          slide={slide}
          heading={variant === 'hero' && first ? 'h1' : 'h2'}
          variant={variant}
          tone="inherit"
          className={VARIANT[variant].textBox}
        />
      </div>
    </div>
  )
}

/**
 * O texto do slide. `theme` usa as tintas do tema (fundo decorativo); `inherit`
 * herda a cor do slide, que sai do contraste com o fundo prolongado — a
 * `primary-ink` e a `muted-foreground` foram medidas contra as superfícies do
 * tema, não contra a cor da foto, e podiam sumir sobre ela.
 */
export const SlideText = ({
  slide,
  heading: Title,
  variant,
  tone,
  className,
}: {
  slide: PublicBanner
  heading: 'h1' | 'h2'
  variant: BannerVariant
  tone: 'theme' | 'inherit'
  className?: string
}) => {
  const hero = variant === 'hero'

  // O meio fica alinhado à esquerda também no celular, como a faixa fixa era.
  return (
    <div className={cn(hero ? 'text-center md:text-left' : 'text-left', className)}>
      {hero && (
        <p
          className={cn(
            'mb-3 text-xs font-medium uppercase tracking-[0.25em] sm:text-sm',
            tone === 'theme' && 'text-primary-ink',
          )}
        >
          Feito à mão + com carinho
        </p>
      )}
      <Title
        className={cn(
          'font-display font-semibold tracking-tight',
          hero ? 'text-4xl leading-tight sm:text-5xl lg:text-6xl' : 'text-3xl sm:text-4xl',
        )}
      >
        {slide.title}
      </Title>
      {slide.subtitle && (
        <p
          className={cn(
            hero ? 'mx-auto mt-4 max-w-xl text-base sm:text-lg md:mx-0' : 'mt-3 max-w-md text-sm leading-relaxed sm:text-base',
            tone === 'theme' && hero && 'text-muted-foreground',
            tone === 'theme' && !hero && 'opacity-80',
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
