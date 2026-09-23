'use client'

import { Children, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Carrossel por scroll-snap — o MESMO padrão já provado na galeria do produto
 * (swipe nativo, sem biblioteca). Generalizado para o hero e os destaques da
 * home: quem chama controla a largura de cada slide pela classe do filho
 * (ex.: `w-full shrink-0 snap-center` no hero; `w-full sm:w-1/2 lg:w-1/4
 * shrink-0 snap-start` nos destaques).
 *
 * Autoplay só onde faz sentido (o hero e o Instagram): 4 banners que ninguém
 * gira são 3 banners mortos. Pausa em hover/toque/foco/aba oculta e respeita
 * prefers-reduced-motion — animação forçada é pior que nenhuma.
 */

type Props = {
  children: React.ReactNode
  ariaLabel: string
  showDots?: boolean
  showArrows?: boolean
  /** Ativa o avanço automático com este intervalo. Ausente = sem autoplay. */
  autoAdvanceMs?: number
  className?: string
  trackClassName?: string
}

export const SnapCarousel = ({
  children,
  ariaLabel,
  showDots,
  showArrows,
  autoAdvanceMs,
  className,
  trackClassName,
}: Props) => {
  const count = Children.count(children)
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const indexRef = useRef(0)
  const [overflowing, setOverflowing] = useState(false)
  const pausedRef = useRef(false)

  // Setas/dots só quando há o que rolar — mesmo critério da faixa de miniaturas.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [count])

  const goTo = useCallback(
    (next: number) => {
      const el = trackRef.current
      if (!el || count === 0) return
      const slideWidth = el.scrollWidth / count
      el.scrollTo({ left: next * slideWidth, behavior: 'smooth' })
    },
    [count],
  )

  useEffect(() => {
    if (!autoAdvanceMs || count <= 1) return
    // Preferência do sistema lida uma vez por montagem: quem muda isso não está
    // com a página aberta no meio de um carrossel.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const timer = setInterval(() => {
      const el = trackRef.current
      if (!el || pausedRef.current || document.hidden) return
      // Foco dentro do trilho também pausa: clicar num iframe (vídeo de um post
      // incorporado do Instagram) não dispara pointer/focus no documento pai.
      if (el.contains(document.activeElement)) return
      // Com vários slides por vista, o scroll bate na borda antes de o índice
      // chegar a count-1 — sem este teste o autoplay parava no fim para sempre.
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
      goTo(atEnd ? 0 : (indexRef.current + 1) % count)
    }, autoAdvanceMs)
    return () => clearInterval(timer)
  }, [autoAdvanceMs, count, goTo])

  return (
    <section
      aria-label={ariaLabel}
      aria-roledescription="carrossel"
      className={cn('relative', className)}
      onPointerEnter={() => (pausedRef.current = true)}
      onPointerLeave={() => (pausedRef.current = false)}
      onFocusCapture={() => (pausedRef.current = true)}
      onBlurCapture={() => (pausedRef.current = false)}
    >
      <div
        ref={trackRef}
        onScroll={(e) => {
          const el = e.currentTarget
          const slideWidth = el.scrollWidth / Math.max(count, 1)
          const next = Math.round(el.scrollLeft / slideWidth)
          if (next !== indexRef.current) {
            indexRef.current = next
            setIndex(next)
          }
        }}
        className={cn('scrollbar-none flex snap-x snap-mandatory overflow-x-auto', trackClassName)}
      >
        {children}
      </div>

      {showArrows && overflowing && (
        <>
          <button
            type="button"
            onClick={() => trackRef.current?.scrollBy({ left: -trackRef.current.clientWidth, behavior: 'smooth' })}
            aria-label="Anterior"
            className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-background/90 p-2 shadow-soft transition-colors hover:bg-accent sm:-left-4"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => trackRef.current?.scrollBy({ left: trackRef.current.clientWidth, behavior: 'smooth' })}
            aria-label="Próximo"
            className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-background/90 p-2 shadow-soft transition-colors hover:bg-accent sm:-right-4"
          >
            <ChevronRight className="size-4" />
          </button>
        </>
      )}

      {showDots && count > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Ir para o slide ${i + 1} de ${count}`}
              aria-current={i === index}
              className={cn(
                'size-2 rounded-full transition-colors',
                i === index ? 'bg-primary' : 'bg-border hover:bg-muted-foreground/40',
              )}
            />
          ))}
        </div>
      )}
    </section>
  )
}
