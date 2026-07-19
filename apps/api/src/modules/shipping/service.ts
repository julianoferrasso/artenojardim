import { randomBytes } from 'node:crypto'
import type { QuoteRequestInput, ShippingOption } from '@ecommerce/shared/contracts'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { getSetting } from '../../shared/settings.js'
import { appError, notFound } from '../../shared/errors.js'
import {
  buildAuthorizeUrl,
  completeAuthorization,
  isConnected,
  savePendingState,
} from '../../integrations/melhor-envio/index.js'
import { toPackages, type PackItem } from './domain/packing.js'
import { activeProvider } from './providers/index.js'

/**
 * Frete: orquestra a cotação (carrega dados do banco, delega a cubagem pura ao
 * domain, chama o provider, aplica as regras da loja) e o fluxo OAuth do provider.
 *
 * O front nunca manda preço nem peso — só o CEP e os itens escolhidos. Tudo o que
 * entra na conta vem da variante, do banco.
 */

/** CEP de origem das encomendas, do endereço da loja. */
const originZip = async (): Promise<string> => {
  const store = await prisma.store.findUnique({
    where: { id: getActiveStoreId() },
    select: { addressJson: true },
  })
  const zip = (store?.addressJson as { zipCode?: string } | null)?.zipCode?.replace(/\D/g, '')
  if (!zip || zip.length !== 8) {
    throw appError(
      ERROR_CODES.SHIPPING_UNAVAILABLE,
      'Origem do frete não configurada: falta o CEP da loja.',
      503,
    )
  }
  return zip
}

/** Carrega peso/dimensões/preço das variantes pedidas e monta os itens de cubagem. */
const loadPackItems = async (items: QuoteRequestInput['items']): Promise<PackItem[]> => {
  const ids = items.map((i) => i.variantId)
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: ids }, storeId: getActiveStoreId() },
    select: { id: true, price: true, weight: true, length: true, width: true, height: true },
  })
  const byId = new Map(variants.map((v) => [v.id, v]))

  return items.map((i) => {
    const v = byId.get(i.variantId)
    if (!v) throw notFound('Produto')
    return {
      variantId: v.id,
      quantity: i.quantity,
      weightGrams: v.weight,
      lengthMm: v.length,
      widthMm: v.width,
      heightMm: v.height,
      priceCents: v.price,
    }
  })
}

export const quoteShipping = async (input: QuoteRequestInput): Promise<ShippingOption[]> => {
  const [fromZip, packItems, config] = await Promise.all([
    originZip(),
    loadPackItems(input.items),
    getSetting('shipping'),
  ])

  const packages = toPackages(packItems)
  const options = await activeProvider.quote({ fromZip, toZip: input.zipCode, packages })

  const subtotalCents = packItems.reduce((sum, it) => sum + it.priceCents * it.quantity, 0)
  const freeShipping =
    config.freeShippingAboveCents !== null && subtotalCents >= config.freeShippingAboveCents

  return options
    // Se a loja restringiu serviços, mantém só os habilitados; lista vazia = todos.
    .filter((o) => config.enabledServices.length === 0 || config.enabledServices.includes(o.id))
    .map((o) => ({
      ...o,
      // Prazo adicional de manuseio (a loja leva X dias para postar).
      deliveryDays: o.deliveryDays + config.additionalDays,
      priceCents: freeShipping ? 0 : o.priceCents,
    }))
    .sort((a, b) => a.priceCents - b.priceCents)
}

// ─── OAuth do provider (conexão da conta do lojista, uma vez) ────────────────

/** Início do fluxo: gera o state anti-CSRF e devolve a URL de consentimento. */
export const startProviderConnection = async (): Promise<{ authorizeUrl: string }> => {
  const state = randomBytes(24).toString('hex')
  await savePendingState(state)
  return { authorizeUrl: buildAuthorizeUrl(state) }
}

/** Callback: valida o state, troca o código por tokens e persiste. */
export const finishProviderConnection = (code: string, state: string): Promise<void> =>
  completeAuthorization(code, state)

export const providerStatus = async (): Promise<{ connected: boolean }> => ({
  connected: await isConnected(),
})
