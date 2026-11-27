'use client'

import { Children, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
 *
 * `loop`: sem começo nem fim — a mesma técnica de clones do Swiper/Slick. O
 * trilho tem 3 cópias dos slides (clone · originais · clone) e, quando a rolagem
 * para fora da cópia do meio, salta sem animação a distância exata de uma cópia:
 * o que está na tela é idêntico antes e depois do salto. As setas e o autoplay
 * andam sempre no mesmo sentido, nunca rebobinam. Se todos os slides cabem na
 * tela, não há o que girar e os clones saem.
 */

type Props = {
  children: React.ReactNode
  ariaLabel: string
  showDots?: boolean
  showArrows?: boolean
  /** Ativa o avanço automático com este intervalo. Ausente = sem autoplay. */
  autoAdvanceMs?: number
  /** Carrossel infinito: depois do último vem o primeiro, nos dois sentidos. */
  loop?: boolean
  className?: string
  trackClassName?: string
  /** Ex.: o hero põe os dots por cima do slide em vez de numa faixa abaixo. */
  dotsClassName?: string
}

/** Tempo sem evento de scroll para considerar a rolagem parada (o `scrollend` não existe em todo Safari). */
const SETTLE_MS = 150

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]'

export const SnapCarousel = ({
  children,
  ariaLabel,
  showDots,
  showArrows,
  autoAdvanceMs,
  loop = false,
  className,
  trackClassName,
  dotsClassName,
}: Props) => {
  const count = Children.count(children)
  const canLoop = loop && count > 1
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const indexRef = useRef(0)
  const [overflowing, setOverflowing] = useState(false)
  // Nasce clonando (o SSR já sai com os clones, e a cópia da esquerda é idêntica
  // aos originais): se depois de medir tudo couber na tela, os clones saem.
  const [looping, setLooping] = useState(canLoop)
  const copiesRef = useRef(looping ? 3 : 1)
  const pausedRef = useRef(false)
  const touchingRef = useRef(false)
  const settleTimerRef = useRef<number | undefined>(undefined)

  /** Largura de um slide e de uma cópia inteira, lidas do trilho. */
  const geometry = useCallback(() => {
    const el = trackRef.current
    if (!el || count === 0) return null
    const slide = el.scrollWidth / (count * copiesRef.current)
    return { el, slide, set: slide * count }
  }, [count])

  const jump = (el: HTMLElement, left: number) => el.scrollTo({ left, behavior: 'instant' })

  // Clonar/desclonar muda o trilho: recoloca a vista no MESMO slide, na cópia do meio.
  useLayoutEffect(() => {
    copiesRef.current = looping ? 3 : 1
    const g = geometry()
    if (g) jump(g.el, ((looping ? count : 0) + indexRef.current) * g.slide)
  }, [looping, count, geometry])

  // Setas/dots só quando há o que rolar — mesmo critério da faixa de miniaturas.
  // No loop o critério é o mesmo, mas medido numa cópia só: com clones sempre transborda.
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const check = () => {
      const g = geometry()
      if (!g) return
      const fits = g.set <= el.clientWidth + 1
      setOverflowing(!fits)
      if (canLoop) setLooping(!fits)
      // A largura dos slides mudou com a janela: o scroll antigo cai no meio de um slide.
      if (copiesRef.current === 3) jump(el, (count + indexRef.current) * g.slide)
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [count, canLoop, geometry])

  // Clone é só imagem: leitor de tela e Tab não passam por ele. Mas continua
  // clicável — na vista parada parte da tela pode ser clone. O observer cobre
  // botões que nascem depois (o "ver mais" da legenda só aparece após medir).
  useEffect(() => {
    const el = trackRef.current
    if (!el || !looping) return
    const unfocus = () =>
      el.querySelectorAll<HTMLElement>(`[data-carousel-clone] :is(${FOCUSABLE})`).forEach((node) => {
        if (node.tabIndex !== -1) node.tabIndex = -1
      })
    unfocus()
    const observer = new MutationObserver(unfocus)
    el.querySelectorAll('[data-carousel-clone]').forEach((clone) =>
      observer.observe(clone, { childList: true, subtree: true }),
    )
    return () => observer.disconnect()
  }, [looping, children])

  /** Parada fora da cópia do meio: volta a ela sem animação (vista idêntica). */
  const settle = useCallback(() => {
    if (copiesRef.current !== 3 || touchingRef.current) return
    const g = geometry()
    if (!g) return
    const pos = g.el.scrollLeft
    if (pos < g.set - 1) jump(g.el, pos + g.set)
    else if (pos > 2 * g.set - 1) jump(g.el, pos - g.set)
  }, [geometry])

  const scheduleSettle = () => {
    window.clearTimeout(settleTimerRef.current)
    settleTimerRef.current = window.setTimeout(settle, SETTLE_MS)
  }

  useEffect(() => () => window.clearTimeout(settleTimerRef.current), [])

  /**
   * Anda `delta` px. No loop, se o destino passaria da borda do trilho, salta
   * antes uma cópia inteira para o lado oposto: o passo nunca é maior que a vista,
   * e a vista é menor que uma cópia, então sempre há trilho para a animação.
   */
  const scrollByStep = useCallback(
    (delta: number) => {
      const g = geometry()
      if (!g) return
      let pos = g.el.scrollLeft
      if (copiesRef.current === 3) {
        const max = g.el.scrollWidth - g.el.clientWidth
        if (pos + delta > max - 1) pos -= g.set
        else if (pos + delta < 1) pos += g.set
        if (pos !== g.el.scrollLeft) jump(g.el, pos)
      }
      g.el.scrollTo({ left: pos + delta, behavior: 'smooth' })
    },
    [geometry],
  )

  const goTo = useCallback(
    (next: number) => {
      const g = geometry()
      if (!g) return
      const offset = copiesRef.current === 3 ? count : 0
      g.el.scrollTo({ left: (offset + next) * g.slide, behavior: 'smooth' })
    },
    [count, geometry],
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
      // Algo aberto no trilho (a legenda expansível de um post) também pausa:
      // no Safari o clique nem dá foco ao botão, então o foco não basta.
      if (el.querySelector('[aria-expanded="true"]')) return
      if (copiesRef.current === 3) {
        scrollByStep(el.scrollWidth / (count * 3))
        return
      }
      // Com vários slides por vista, o scroll bate na borda antes de o índice
      // chegar a count-1 — sem este teste o autoplay parava no fim para sempre.
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
      goTo(atEnd ? 0 : (indexRef.current + 1) % count)
    }, autoAdvanceMs)
    return () => clearInterval(timer)
  }, [autoAdvanceMs, count, goTo, scrollByStep])

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
          const copies = copiesRef.current
          const slideWidth = el.scrollWidth / Math.max(count * copies, 1)
          const raw = Math.round(el.scrollLeft / slideWidth) - (copies === 3 ? count : 0)
          const next = ((raw % count) + count) % count
          if (next !== indexRef.current) {
            indexRef.current = next
            setIndex(next)
          }
          if (copies === 3) scheduleSettle()
        }}
        // Saltar o scroll com o dedo na tela dá tranco no iOS: o salto espera soltar.
        onTouchStart={() => (touchingRef.current = true)}
        onTouchEnd={() => {
          touchingRef.current = false
          scheduleSettle()
        }}
        onTouchCancel={() => {
          touchingRef.current = false
          scheduleSettle()
        }}
        className={cn('scrollbar-none flex snap-x snap-mandatory overflow-x-auto', trackClassName)}
      >
        {/* `contents`: o wrapper não vira caixa, e cada slide continua item do flex. */}
        {looping && (
          <div data-carousel-clone aria-hidden className="contents">
            {children}
          </div>
        )}
        {children}
        {looping && (
          <div data-carousel-clone aria-hidden className="contents">
            {children}
          </div>
        )}
      </div>

      {showArrows && overflowing && (
        <>
          <button
            type="button"
            onClick={() => trackRef.current && scrollByStep(-trackRef.current.clientWidth)}
            aria-label="Anterior"
            className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-background/90 p-2 shadow-soft transition-colors hover:bg-accent sm:-left-4"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => trackRef.current && scrollByStep(trackRef.current.clientWidth)}
            aria-label="Próximo"
            className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-background/90 p-2 shadow-soft transition-colors hover:bg-accent sm:-right-4"
          >
            <ChevronRight className="size-4" />
          </button>
        </>
      )}

      {showDots && count > 1 && (
        <div className={cn('mt-4 flex justify-center gap-2', dotsClassName)}>
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
