'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Legenda do post incorporado: 2 linhas e "ver mais", o mesmo gesto do
 * Instagram. É NOSSA e não a do iframe porque a do iframe não encolhe — é
 * cross-origin, e com ela o cartão passava de 1000px de altura.
 *
 * O `aria-expanded` não é só acessibilidade: o SnapCarousel pausa o autoplay
 * enquanto houver um aberto no trilho, senão o slide sai no meio da leitura.
 */
export const ExpandableCaption = ({ text }: { text: string }) => {
  const id = useId()
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  // Botão só se o texto de fato passa de 2 linhas: "ver mais" que não mostra
  // nada a mais é ruído.
  const [clamped, setClamped] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || open) return
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [open, text])

  return (
    <div className="mt-2 px-1">
      <p
        id={id}
        ref={ref}
        className={cn('whitespace-pre-line text-sm text-muted-foreground', !open && 'line-clamp-2')}
      >
        {text}
      </p>
      {(clamped || open) && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-sm font-medium text-primary-ink hover:underline"
        >
          {open ? 'ver menos' : 'ver mais'}
        </button>
      )}
    </div>
  )
}
