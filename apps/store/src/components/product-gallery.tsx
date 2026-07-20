'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { imagesForVariant, type ProductImage as ProductImageType } from '@ecommerce/shared/contracts'
import { ProductImage, ImagePlaceholder } from './product-image'
import { GalleryLightbox } from './gallery-lightbox'
import { GalleryZoomPanel } from './gallery-zoom-panel'
import { cn } from '@/lib/utils'

/**
 * Galeria da página do produto. Antes daqui a loja mostrava só `images[0]` —
 * um produto com cinco fotos exibia uma.
 *
 * Desktop: foto principal + faixa de miniaturas abaixo, lupa no hover.
 * Mobile: carrossel com swipe nativo (scroll-snap) + dots; sem lupa (não há
 * hover em toque), tap abre o lightbox.
 */

/** Distância acima da qual o gesto foi swipe, não toque — não deve abrir o lightbox. */
const TAP_SLOP_PX = 10

export const ProductGallery = ({
  images: allImages,
  variantId,
  productName,
}: {
  images: ProductImageType[]
  variantId: string | null
  productName: string
}) => {
  // Mesma ordem de resolução que a API usa para congelar a foto do pedido.
  const images = useMemo(
    () => imagesForVariant(allImages, variantId),
    [allImages, variantId],
  )

  const [index, setIndex] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbsRef = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const tapStart = useRef<{ x: number; scroll: number } | null>(null)

  const current = images[Math.min(index, images.length - 1)]
  const single = images.length <= 1

  // Trocar de variação troca o conjunto de fotos: voltar ao início evita
  // mostrar a 4ª foto de uma galeria que agora tem 2.
  useEffect(() => {
    setIndex(0)
    trackRef.current?.scrollTo({ left: 0 })
  }, [variantId])

  // As setas da faixa só existem quando há o que rolar.
  useEffect(() => {
    const el = thumbsRef.current
    if (!el) return
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [images.length])

  const select = (next: number) => {
    setIndex(next)
    trackRef.current?.scrollTo({ left: next * trackRef.current.clientWidth, behavior: 'smooth' })
  }

  if (images.length === 0) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-lg">
        <ImagePlaceholder />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Desktop: foto única, lupa no hover, clique abre o lightbox ── */}
      <div
        ref={mainRef}
        onClick={() => setLightbox(true)}
        className="relative hidden aspect-square w-full cursor-zoom-in overflow-hidden rounded-lg bg-muted md:block"
      >
        {current && (
          <ProductImage
            src={current.url}
            alt={current.alt ?? productName}
            fit="contain"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority={index === 0}
          />
        )}
        {current && (
          <GalleryZoomPanel image={current} productName={productName} containerRef={mainRef} />
        )}
      </div>

      {/* ── Mobile: carrossel com swipe nativo ── */}
      <div
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget
          const next = Math.round(el.scrollLeft / el.clientWidth)
          if (next !== index) setIndex(next)
        }}
        onPointerDown={(e) => {
          tapStart.current = { x: e.clientX, scroll: e.currentTarget.scrollLeft }
        }}
        onPointerUp={(e) => {
          // Um swipe termina com pointerup sobre o track; sem esta guarda, todo
          // arrastar para o lado abriria o lightbox no fim do gesto.
          const start = tapStart.current
          tapStart.current = null
          if (!start) return
          const moved =
            Math.abs(e.clientX - start.x) > TAP_SLOP_PX ||
            Math.abs(e.currentTarget.scrollLeft - start.scroll) > TAP_SLOP_PX
          if (!moved) setLightbox(true)
        }}
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto rounded-lg bg-muted md:hidden"
      >
        {images.map((img, i) => (
          <div key={img.id} className="relative aspect-square w-full shrink-0 snap-center">
            <ProductImage
              src={img.url}
              alt={img.alt ?? productName}
              fit="contain"
              sizes="100vw"
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      {/* Dots — só quando há mais de uma foto. */}
      {!single && (
        <div className="flex justify-center gap-1.5 md:hidden">
          {images.map((img, i) => (
            <span
              key={img.id}
              className={cn('size-1.5 rounded-full', i === index ? 'bg-primary' : 'bg-border')}
            />
          ))}
        </div>
      )}

      <p className="hidden text-center text-xs text-muted-foreground md:block">
        Passe o mouse para ampliar
      </p>

      {/* ── Faixa de miniaturas (desktop) ── */}
      {!single && (
        <div className="relative hidden md:block">
          {overflowing && (
            <button
              type="button"
              onClick={() => thumbsRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
              aria-label="Miniaturas anteriores"
              className="absolute -left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-background p-1 hover:bg-accent"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}

          <div ref={thumbsRef} className="scrollbar-none flex gap-2 overflow-x-auto">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => select(i)}
                aria-label={`Ver imagem ${i + 1} de ${images.length}`}
                aria-current={i === index}
                className={cn(
                  'relative size-20 shrink-0 overflow-hidden rounded-md border-2 bg-muted transition-colors',
                  i === index ? 'border-primary' : 'border-transparent hover:border-border',
                )}
              >
                <ProductImage
                  src={img.url}
                  alt={img.alt ?? `${productName} — imagem ${i + 1}`}
                  fit="cover"
                  sizes="80px"
                />
              </button>
            ))}
          </div>

          {overflowing && (
            <button
              type="button"
              onClick={() => thumbsRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
              aria-label="Próximas miniaturas"
              className="absolute -right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-background p-1 hover:bg-accent"
            >
              <ChevronRight className="size-4" />
            </button>
          )}
        </div>
      )}

      {lightbox && (
        <GalleryLightbox
          images={images}
          index={index}
          productName={productName}
          onIndexChange={setIndex}
          onClose={() => setLightbox(false)}
        />
      )}
    </div>
  )
}
