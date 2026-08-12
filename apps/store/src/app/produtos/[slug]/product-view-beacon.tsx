'use client'

import { useEffect, useRef } from 'react'
import { ROUTES } from '@ecommerce/shared/constants'
import { clientFetch } from '@/lib/client'
import { useAuth } from '@/lib/auth'

/**
 * Dispara o registro de visita quando a página do produto monta no cliente.
 *
 * A página é Server Component; este beacon é o pedacinho 'use client' que conta a
 * visita REAL (no browser), não o render de SSR/prefetch. Best-effort: qualquer
 * falha é engolida — métrica nunca pode quebrar a vitrine. Uma contagem por
 * sessão por produto, para F5 não inflar o número.
 *
 * `clientFetch` e não `apiFetch`: ele anexa o Bearer QUANDO existe, e é o que
 * permite à API atribuir a visita ao cliente logado. Anônimo continua contando
 * normalmente — o cliente não exige sessão.
 */
export function ProductViewBeacon({ slug }: { slug: string }) {
  const { loading } = useAuth()
  const fired = useRef(false)

  useEffect(() => {
    // Esperar o bootstrap da sessão antes de disparar. Sem isto, todo cliente que
    // chega por link direto ou dá F5 manda o beacon ANTES de o AuthProvider
    // terminar o /auth/refresh — e conta como anônimo. O histórico por cliente
    // nasceria permanentemente vazio, sem erro nenhum para denunciar o motivo.
    if (loading || fired.current) return
    fired.current = true

    const key = `pv:${slug}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // sessionStorage pode estar indisponível (modo privado); segue e conta.
    }

    void clientFetch(ROUTES.productViews.track, {
      method: 'POST',
      body: JSON.stringify({ slug }),
    }).catch(() => {
      // Silêncio proposital: o beacon não afeta a página nem o usuário.
    })
  }, [slug, loading])

  return null
}
