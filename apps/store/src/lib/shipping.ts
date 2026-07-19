'use client'

import { ROUTES } from '@ecommerce/shared/constants'
import type { QuoteRequestInput, ShippingOption } from '@ecommerce/shared/contracts'
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
