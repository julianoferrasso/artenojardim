'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import type { ProductImage as ProductImageType } from '@ecommerce/shared/contracts'

/**
 * Lupa: painel ao lado da foto mostrando o trecho sob o cursor, ampliado.
 *
 * Duas armadilhas resolvidas aqui:
 *
 * 1. Com `object-contain` a foto NÃO preenche o container — sobra tarja. Mapear
 *    o cursor pelo retângulo do container faz o zoom derivar perto das bordas.
 *    Por isso calculamos a caixa realmente ocupada pela imagem (`containedBox`).
 * 2. Ampliar 2x um arquivo pequeno só entrega borrão com cara de bug. O fator
 *    efetivo é limitado pela resolução real (`width` do upload).
 *
 * O movimento escreve direto no `style.transform` via ref: um `useState` a cada
 * mousemove re-renderizaria a árvore 60 vezes por segundo à toa.
 */

const MAX_ZOOM = 2
/** Abaixo disto a lupa não entrega detalhe novo — melhor não oferecer. */
const MIN_USEFUL_ZOOM = 1.2

/** Caixa ocupada pela imagem dentro do container, considerando `object-contain`. */
const containedBox = (rect: DOMRect, natural: number) => {
  const box = rect.width / rect.height
  const width = natural > box ? rect.width : rect.height * natural
  const height = natural > box ? rect.width / natural : rect.height
  return { width, height, offsetX: (rect.width - width) / 2, offsetY: (rect.height - height) / 2 }
}

export const GalleryZoomPanel = ({
  image,
  productName,
  containerRef,
}: {
  image: ProductImageType
  productName: string
  containerRef: React.RefObject<HTMLElement | null>
}) => {
  const [visible, setVisible] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)

  // Sem dimensões (uploads antigos) não dá para saber se a ampliação vale —
  // assume que vale, o pior caso é uma foto um pouco menos nítida.
  const natural = image.width && image.height ? image.width / image.height : null

  const onMove = (e: React.MouseEvent) => {
    const container = containerRef.current
    const surface = surfaceRef.current
    const panel = panelRef.current
    if (!container || !surface || !panel) return

    const rect = container.getBoundingClientRect()
    const { width, height, offsetX, offsetY } = containedBox(rect, natural ?? rect.width / rect.height)

    const x = (e.clientX - rect.left - offsetX) / width
    const y = (e.clientY - rect.top - offsetY) / height

    // Cursor na tarja (fora da foto) — nada a ampliar.
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      setVisible(false)
      return
    }

    const zoom = image.width ? Math.min(MAX_ZOOM, image.width / width) : MAX_ZOOM
    if (zoom < MIN_USEFUL_ZOOM) {
      setVisible(false)
      return
    }
    setVisible(true)

    const panelRect = panel.getBoundingClientRect()
    const scaledW = panelRect.width * zoom
    const scaledH = panelRect.height * zoom
    surface.style.width = `${scaledW}px`
    surface.style.height = `${scaledH}px`
    surface.style.transform = `translate3d(${-x * (scaledW - panelRect.width)}px, ${
      -y * (scaledH - panelRect.height)
    }px, 0)`
  }

  return (
    <>
      {/* Captura o mouse sobre a foto sem interferir no clique que abre o lightbox. */}
      <div
        className="absolute inset-0 z-10 hidden md:block"
        onMouseMove={onMove}
        onMouseLeave={() => setVisible(false)}
        aria-hidden
      />

      <div
        ref={panelRef}
        className={`absolute inset-y-0 left-full z-20 ml-4 hidden w-full overflow-hidden rounded-lg border border-border bg-background md:block ${
          visible ? '' : 'invisible'
        }`}
        aria-hidden
      >
        {/* Só monta a imagem grande depois do primeiro hover — nunca no load. */}
        {visible && (
          <div ref={surfaceRef} className="relative will-change-transform">
            <Image
              src={image.url}
              alt={image.alt ?? productName}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-contain"
            />
          </div>
        )}
      </div>
    </>
  )
}
