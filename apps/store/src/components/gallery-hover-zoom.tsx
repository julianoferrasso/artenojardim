'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import type { ProductImage as ProductImageType } from '@ecommerce/shared/contracts'
import { containedBox } from '@/lib/image-box'
import { cn } from '@/lib/utils'

/**
 * Zoom no hover DENTRO da foto: não cobre preço nem Comprar e cabe em qualquer
 * largura. A antiga lupa ao lado ficava fora do frame `overflow-hidden` e nunca
 * apareceu.
 *
 * - O fator é limitado pela resolução real (`width` do upload): ampliar além
 *   disso só entrega borrão com cara de bug.
 * - A imagem ampliada pede ao next/image o tamanho em que será DESENHADA. Pedir
 *   o tamanho do frame e esticar 2x era o segundo motivo do borrão.
 * - O movimento escreve direto no `style.transform` via ref: um `useState` a
 *   cada pointermove re-renderizaria 60 vezes por segundo à toa.
 */

const MAX_ZOOM = 2.5
/** Abaixo disto o zoom não mostra detalhe novo — melhor não oferecer. */
const MIN_USEFUL_ZOOM = 1.2
/** Sem dimensões no banco (uploads antigos) não dá para medir; assume que vale. */
const UNKNOWN_SIZE_ZOOM = 2

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export const GalleryHoverZoom = ({ image }: { image: ProductImageType }) => {
  const surfaceRef = useRef<HTMLSpanElement>(null)
  const lastMove = useRef<{ x: number; y: number; rect: DOMRect } | null>(null)
  // Tamanho da foto ampliada; null = a imagem grande ainda não foi montada.
  // Só nasce no 1º hover — nunca no carregamento da página.
  const [scaled, setScaled] = useState<{ width: number; height: number } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [active, setActive] = useState(false)

  const ratio = image.width && image.height ? image.width / image.height : null

  const apply = () => {
    const move = lastMove.current
    const surface = surfaceRef.current
    if (!move || !surface) return
    const { rect } = move
    const box = containedBox(rect, ratio ?? rect.width / rect.height)
    const width = surface.offsetWidth
    const height = surface.offsetHeight
    const x = clamp01((move.x - rect.left - box.offsetX) / box.width)
    const y = clamp01((move.y - rect.top - box.offsetY) / box.height)
    // Menor que o frame num eixo: centraliza. Maior: o cursor sobre a foto
    // percorre a foto ampliada inteira, de borda a borda.
    const tx = width <= rect.width ? (rect.width - width) / 2 : -x * (width - rect.width)
    const ty = height <= rect.height ? (rect.height - height) / 2 : -y * (height - rect.height)
    surface.style.transform = `translate3d(${tx}px, ${ty}px, 0)`
  }

  const onMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    // No iPad o frame do desktop aparece, mas o toque emula hover: o zoom
    // piscaria antes de abrir a tela cheia.
    if (e.pointerType !== 'mouse') return

    const rect = e.currentTarget.getBoundingClientRect()
    const box = containedBox(rect, ratio ?? rect.width / rect.height)
    const zoom = image.width ? Math.min(MAX_ZOOM, image.width / box.width) : UNKNOWN_SIZE_ZOOM
    if (zoom < MIN_USEFUL_ZOOM) return

    const width = Math.round(box.width * zoom)
    const height = Math.round(box.height * zoom)
    if (scaled?.width !== width || scaled.height !== height) setScaled({ width, height })
    if (!active) setActive(true)

    lastMove.current = { x: e.clientX, y: e.clientY, rect }
    apply()
  }

  return (
    <span
      aria-hidden
      onPointerMove={onMove}
      onPointerLeave={() => setActive(false)}
      className="absolute inset-0 block overflow-hidden"
    >
      {scaled && (
        <span
          className={cn(
            'absolute inset-0 block bg-muted transition-opacity duration-200 motion-reduce:transition-none',
            active && loaded ? 'opacity-100' : 'opacity-0',
          )}
        >
          <span
            ref={surfaceRef}
            className="absolute left-0 top-0 block"
            style={{ width: scaled.width, height: scaled.height }}
          >
            <Image
              src={image.url}
              alt=""
              fill
              sizes={`${scaled.width}px`}
              className="object-cover"
              onLoad={() => {
                setLoaded(true)
                apply()
              }}
            />
          </span>
        </span>
      )}
    </span>
  )
}
