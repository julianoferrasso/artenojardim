'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react'
import { imagesForVariant, type ProductImage as ProductImageType } from '@ecommerce/shared/contracts'
import { ProductImage, ImagePlaceholder } from './product-image'
import { GalleryHoverZoom } from './gallery-hover-zoom'
import { openGalleryViewer, prefetchGalleryViewer } from '@/lib/gallery-viewer'
import { cn } from '@/lib/utils'

/**
 * Galeria da página do produto. Antes daqui a loja mostrava só `images[0]` —
 * um produto com cinco fotos exibia uma.
 *
 * Desktop: foto principal com zoom no hover (dentro da foto) + miniaturas;
 * clique abre a tela cheia.
 * Mobile: carrossel com swipe nativo (scroll-snap) + miniaturas; sem zoom no
 * hover (não há hover em toque), o toque abre a tela cheia, onde há pinça e
 * duplo toque. Miniaturas e não bolinhas: a bolinha não diz o que tem na foto.
 */

/** Distância acima da qual o gesto foi swipe, não toque — não deve abrir a tela cheia. */
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
  // A tela cheia lê o índice fora do ciclo de render (ao fechar, para achar o frame).
  const indexRef = useRef(0)
  indexRef.current = index
  const mainRef = useRef<HTMLButtonElement>(null)
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

  // A tela cheia trocou de foto: a página acompanha sem animar, para a animação
  // de fechar cair sobre a foto certa.
  const follow = (next: number) => {
    indexRef.current = next
    setIndex(next)
    trackRef.current?.scrollTo({ left: next * trackRef.current.clientWidth })
  }

  // Só um dos dois layouts está visível; o escondido mede 0×0.
  const getFrame = (i: number): HTMLElement | null => {
    const main = mainRef.current
    if (main?.offsetParent) return i === indexRef.current ? main : null
    const track = trackRef.current
    return track?.offsetParent ? ((track.children[i] as HTMLElement | undefined) ?? null) : null
  }

  const open = () => {
    void openGalleryViewer({ images, index, productName, getFrame, onIndexChange: follow })
  }

  if (images.length === 0) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-xl">
        <ImagePlaceholder />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3" onPointerEnter={prefetchGalleryViewer}>
      {/* ── Desktop: zoom no hover, clique abre a tela cheia ── */}
      <button
        ref={mainRef}
        type="button"
        onClick={open}
        aria-label="Ampliar foto"
        className="relative hidden aspect-square w-full cursor-zoom-in overflow-hidden rounded-xl bg-muted shadow-soft outline-none focus-visible:ring-2 focus-visible:ring-ring md:block"
      >
        {/* A foto da página vem ANTES da camada de zoom: a tela cheia pega o
            primeiro <img> do frame para animar e servir de placeholder. */}
        {current && (
          <ProductImage
            src={current.url}
            alt={current.alt ?? productName}
            fit="contain"
            // A coluna da foto não passa de ~480 px (max-w-5xl em duas colunas).
            sizes="(max-width: 768px) 100vw, 480px"
            priority={index === 0}
          />
        )}
        {current && <GalleryHoverZoom key={current.id} image={current} />}
      </button>

      {/* ── Mobile: carrossel com swipe nativo ── */}
      <div className="relative md:hidden">
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
            // arrastar para o lado abriria a tela cheia no fim do gesto.
            const start = tapStart.current
            tapStart.current = null
            if (!start) return
            const moved =
              Math.abs(e.clientX - start.x) > TAP_SLOP_PX ||
              Math.abs(e.currentTarget.scrollLeft - start.scroll) > TAP_SLOP_PX
            if (!moved) open()
          }}
          className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto rounded-xl bg-muted"
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

        {/* Sinal de que o toque amplia; fora do track para não rolar junto. */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 text-xs font-medium text-foreground shadow-soft"
        >
          {!single && `${index + 1}/${images.length}`}
          <Expand className="size-3.5" />
        </span>
      </div>

      <p className="hidden text-center text-xs text-muted-foreground md:block">
        Passe o mouse para ampliar · clique para ver em tela cheia
      </p>

      {/* ── Faixa de miniaturas ── */}
      {!single && (
        <div className="relative">
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
                // No desktop, passar o mouse já troca a foto. O toque também
                // dispara pointerenter, mas aí o clique vem logo atrás.
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse' && i !== index) select(i)
                }}
                aria-label={`Ver imagem ${i + 1} de ${images.length}`}
                aria-current={i === index}
                className={cn(
                  'relative size-16 shrink-0 overflow-hidden rounded-lg border-2 bg-muted transition-colors md:size-20',
                  // A borda é o ÚNICO sinal de qual miniatura está aberta, então
                  // usa a tinta derivada: `border-primary` some com marca clara.
                  i === index ? 'border-primary-ink' : 'border-transparent hover:border-border',
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
    </div>
  )
}
