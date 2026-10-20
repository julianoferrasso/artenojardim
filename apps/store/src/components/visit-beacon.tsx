'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { ROUTES } from '@ecommerce/shared/constants'
import { spDayKey } from '@ecommerce/shared/utils'
import { clientFetch } from '@/lib/client'

/**
 * Conta a visita à loja: uma por SESSÃO do navegador. É o denominador da taxa de
 * conversão do painel.
 *
 * Sessão = 30 min sem atividade, ou a virada do dia em Brasília (o mesmo critério
 * de Shopify e GA). O localStorage guarda só um carimbo — quando esta pessoa foi
 * vista pela última vez e em que dia —, nenhum identificador; o servidor só soma
 * contadores. Por isso a métrica dispensa cookie e consentimento.
 *
 * Best-effort, como o beacon de produto: qualquer falha é engolida.
 */

const STORAGE_KEY = 'aj:visit'
const SESSION_GAP_MS = 30 * 60_000

type Stamp = { lastSeen: number; day: string }

/** Quando o storage está bloqueado, a aba ao menos não conta uma visita por página. */
let memoryStamp: Stamp | null = null

const readStamp = (): Stamp | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return memoryStamp
    const parsed = JSON.parse(raw) as Partial<Stamp>
    return typeof parsed.lastSeen === 'number' && typeof parsed.day === 'string'
      ? { lastSeen: parsed.lastSeen, day: parsed.day }
      : null
  } catch {
    return memoryStamp
  }
}

const writeStamp = (stamp: Stamp): void => {
  memoryStamp = stamp
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stamp))
  } catch {
    // O fallback em memória segura a sessão desta aba.
  }
}

/**
 * Só o HOST, e só se for de fora: caminho e query de outro site podem carregar
 * dado pessoal, e navegação interna não é origem de nada.
 */
const externalReferrerHost = (): string | undefined => {
  try {
    if (!document.referrer) return undefined
    const host = new URL(document.referrer).hostname
    return host && host !== location.hostname ? host : undefined
  } catch {
    return undefined
  }
}

const utm = (params: URLSearchParams, key: string): string | undefined =>
  params.get(key)?.trim().slice(0, 100) || undefined

export function VisitBeacon() {
  const pathname = usePathname()
  const isLanding = useRef(true)

  // `location.search` e `document.referrer` lidos aqui dentro, e não via
  // useSearchParams: no layout raiz ele forçaria Suspense na loja inteira.
  useEffect(() => {
    // Automação (Playwright, Lighthouse rodando a loja) não é visita.
    if (navigator.webdriver) return

    const now = Date.now()
    const day = spDayKey(new Date(now))
    const previous = readStamp()
    const isNewSession = !previous || now - previous.lastSeen > SESSION_GAP_MS || previous.day !== day
    // Toda navegação renova o carimbo: a sessão só expira com 30 min PARADA.
    writeStamp({ lastSeen: now, day })

    // Referrer só diz algo na página em que a pessoa chegou; nas navegações da
    // SPA o document.referrer continua apontando para lá.
    const landing = isLanding.current
    isLanding.current = false
    if (!isNewSession) return

    const params = new URLSearchParams(location.search)
    void clientFetch(ROUTES.visits.track, {
      method: 'POST',
      body: JSON.stringify({
        referrerHost: landing ? externalReferrerHost() : undefined,
        utmSource: utm(params, 'utm_source'),
        utmMedium: utm(params, 'utm_medium'),
      }),
    }).catch(() => {
      // Silêncio proposital: métrica nunca quebra a vitrine.
    })
  }, [pathname])

  return null
}
