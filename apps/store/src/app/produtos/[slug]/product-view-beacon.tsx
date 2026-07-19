'use client'

import { useEffect, useRef } from 'react'
import { ROUTES } from '@ecommerce/shared/constants'
import { apiFetch } from '@/lib/api'

/**
 * Dispara o registro de visita quando a página do produto monta no cliente.
 *
 * A página é Server Component; este beacon é o pedacinho 'use client' que conta a
 * visita REAL (no browser), não o render de SSR/prefetch. Best-effort: qualquer
 * falha é engolida — métrica nunca pode quebrar a vitrine. Uma contagem por
 * sessão por produto, para F5 não inflar o número.
 */
export function ProductViewBeacon({ slug }: { slug: string }) {
  const fired = useRef(false)

  useEffect(() => {
    // Guarda contra o duplo-invoke do StrictMode em dev.
    if (fired.current) return
    fired.current = true

    const key = `pv:${slug}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // sessionStorage pode estar indisponível (modo privado); segue e conta.
    }

    void apiFetch(ROUTES.productViews.track, {
      method: 'POST',
      body: JSON.stringify({ slug }),
    }).catch(() => {
      // Silêncio proposital: o beacon não afeta a página nem o usuário.
    })
  }, [slug])

  return null
}
