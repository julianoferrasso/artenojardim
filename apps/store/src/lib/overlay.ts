'use client'

import { useEffect, useRef } from 'react'

/**
 * O mínimo de acessibilidade que todo overlay precisa, sem trazer uma
 * biblioteca de dialog. Usado pelo lightbox da galeria E pelo minicarrinho —
 * é o reuso entre os dois que justifica o arquivo.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Prende o Tab dentro do painel e devolve o foco a quem abriu. */
export const useFocusTrap = (ref: React.RefObject<HTMLElement | null>, active: boolean) => {
  useEffect(() => {
    if (!active) return
    const panel = ref.current
    if (!panel) return

    const previous = document.activeElement as HTMLElement | null
    const first = panel.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel).focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const nodes = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      )
      if (nodes.length === 0) return
      const firstNode = nodes[0]!
      const lastNode = nodes[nodes.length - 1]!
      if (e.shiftKey && document.activeElement === firstNode) {
        e.preventDefault()
        lastNode.focus()
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault()
        firstNode.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Devolver o foco só faz sentido se o elemento ainda está no documento.
      if (previous?.isConnected) previous.focus()
    }
  }, [ref, active])
}

// Contador de módulo: com lightbox e minicarrinho abertos ao mesmo tempo, o
// primeiro a fechar destravaria o scroll com o outro ainda aberto.
let lockCount = 0
let restoreStyles: { overflow: string; paddingRight: string } | null = null

/** Trava o scroll do body, compensando a barra para o layout não "pular". */
export const useBodyScrollLock = (active: boolean) => {
  useEffect(() => {
    if (!active) return

    if (lockCount === 0) {
      const { overflow, paddingRight } = document.body.style
      restoreStyles = { overflow, paddingRight }
      const gap = window.innerWidth - document.documentElement.clientWidth
      document.body.style.overflow = 'hidden'
      if (gap > 0) document.body.style.paddingRight = `${gap}px`
    }
    lockCount += 1

    return () => {
      lockCount -= 1
      if (lockCount === 0 && restoreStyles) {
        document.body.style.overflow = restoreStyles.overflow
        document.body.style.paddingRight = restoreStyles.paddingRight
        restoreStyles = null
      }
    }
  }, [active])
}

/** Esc fecha. */
export const useEscapeKey = (onEscape: () => void, active: boolean) => {
  // Ref para não reassinar o listener a cada render do consumidor.
  const handler = useRef(onEscape)
  handler.current = onEscape

  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [active])
}
