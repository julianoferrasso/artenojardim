'use client'

import { ROUTES, businessDaysLabel } from '@ecommerce/shared/constants'
import type { QuoteRequestInput, ShippingOption } from '@ecommerce/shared/contracts'
import { formatSpDeliveryDay } from '@ecommerce/shared/utils'
import { ApiError } from './api'

/**
 * Cotação de frete a partir do browser. Endpoint PÚBLICO — o visitante calcula o
 * frete no produto sem login. Não decide nada: manda CEP + itens e recebe as
 * opções que o backend calculou do banco.
 */

const apiBase = (): string => {
  const url = process.env.NEXT_PUBLIC_API_URL
  if (!url) throw new Error('NEXT_PUBLIC_API_URL não configurada')
  return url
}

export const quoteShipping = async (input: QuoteRequestInput): Promise<ShippingOption[]> => {
  const res = await fetch(`${apiBase()}${ROUTES.shipping.quote}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(body?.error?.code ?? 'INTERNAL_ERROR', body?.error?.message ?? `Erro ${res.status}`, res.status)
  }
  return ((await res.json()) as { data: ShippingOption[] }).data
}

/**
 * Cotação do simulador, que agora roda sozinha com o CEP lembrado. Sem cache,
 * cada produto aberto gastaria uma das 60 cotações/h por IP (e 1–3s no Melhor
 * Envio). Guarda a PROMISE, então duas montagens simultâneas dividem o mesmo
 * request; erro sai do cache para a próxima tentativa ir à API. O checkout não
 * usa isto: lá o valor precisa estar fresco.
 */
const QUOTE_TTL_MS = 10 * 60_000
const quoteCache = new Map<string, { at: number; promise: Promise<ShippingOption[]> }>()

export const quoteShippingCached = (input: QuoteRequestInput): Promise<ShippingOption[]> => {
  const key = [
    input.zipCode,
    ...input.items.map((i) => `${i.variantId}:${i.quantity}`).sort(),
  ].join('|')
  const hit = quoteCache.get(key)
  if (hit && Date.now() - hit.at < QUOTE_TTL_MS) return hit.promise

  const promise = quoteShipping(input)
  quoteCache.set(key, { at: Date.now(), promise })
  promise.catch(() => {
    if (quoteCache.get(key)?.promise === promise) quoteCache.delete(key)
  })
  return promise
}

/**
 * "Chega até sáb., 14 de nov." — DATA, e não "N dias úteis": dia útil confunde
 * e a data é lida como promessa (Baymard). A API já somou produção, postagem e
 * transporte; sem a data (cotação antiga em cache), cai no prazo em dias.
 */
export const deliveryLabel = (o: Pick<ShippingOption, 'deliveryDays' | 'productionDays' | 'estimatedDeliveryAt'>): string =>
  o.estimatedDeliveryAt
    ? `Chega até ${formatSpDeliveryDay(o.estimatedDeliveryAt)}`
    : `Chega em até ${businessDaysLabel(o.deliveryDays + (o.productionDays ?? 0))}`
