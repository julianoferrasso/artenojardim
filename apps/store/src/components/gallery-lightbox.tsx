'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { ProductImage as ProductImageType } from '@ecommerce/shared/contracts'
import { ProductImage } from './product-image'
import { useBodyScrollLock, useEscapeKey, useFocusTrap } from '@/lib/overlay'

/**
 * Ampliação em tela cheia. O swipe no mobile é o MESMO scroll-snap da galeria —
 * reaproveitar o scroll nativo evita reimplementar gesto e mantém o
 * comportamento idêntico ao da faixa principal.
 */
export const GalleryLightbox = ({
  images,
  index,
  productName,
  onIndexChange,
  onClose,
}: {
  images: ProductImageType[]
  index: number
  productName: string
  onIndexChange: (index: number) => void
  onClose: () => void
}) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const single = images.length <= 1

  useFocusTrap(panelRef, true)
  useBodyScrollLock(true)
  useEscapeKey(onClose, true)

  const go = (next: number) => {
    if (images.length === 0) return
    const wrapped = (next + images.length) % images.length
    onIndexChange(wrapped)
    trackRef.current?.scrollTo({ left: wrapped * trackRef.current.clientWidth })
  }

  // Alinha o track quando o lightbox abre já num índice > 0 (sem animar: é a
  // posição inicial, não uma navegação).
  useEffect(() => {
    const track = trackRef.current
    if (track) track.scrollTo({ left: index * track.clientWidth })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1)
      if (e.key === 'ArrowLeft') go(index - 1)
      if (e.key === 'Home') go(0)
      if (e.key === 'End') go(images.length - 1)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-foreground/90"
      // Fecha só quando o clique é no fundo, não numa foto.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Galeria de ${productName}`}
        className="flex size-full flex-col outline-none"
      >
        <div className="flex justify-end p-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-md p-2 text-background hover:bg-background/10"
          >
            <X className="size-6" />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center">
          {!single && (
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Imagem anterior"
              className="absolute left-2 z-10 rounded-full bg-background/80 p-2 text-foreground hover:bg-background md:left-6"
            >
              <ChevronLeft className="size-6" />
            </button>
          )}

          <div
            ref={trackRef}
            onScroll={(e) => {
              const el = e.currentTarget
              const next = Math.round(el.scrollLeft / el.clientWidth)
              if (next !== index) onIndexChange(next)
            }}
            className="scrollbar-none flex size-full snap-x snap-mandatory overflow-x-auto"
          >
            {images.map((img) => (
              <div key={img.id} className="relative size-full shrink-0 snap-center">
                <ProductImage
                  src={img.url}
                  alt={img.alt ?? productName}
                  fit="contain"
                  sizes="100vw"
                />
              </div>
            ))}
          </div>

          {!single && (
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Próxima imagem"
              className="absolute right-2 z-10 rounded-full bg-background/80 p-2 text-foreground hover:bg-background md:right-6"
            >
              <ChevronRight className="size-6" />
            </button>
          )}
        </div>

        <p className="p-4 text-center text-sm text-background/80" aria-live="polite">
          {images.length > 0 ? `${index + 1} / ${images.length}` : ''}
        </p>
      </div>
    </div>,
    document.body,
  )
}
