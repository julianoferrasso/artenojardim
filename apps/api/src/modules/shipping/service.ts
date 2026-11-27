import { randomBytes } from 'node:crypto'
import type {
  MeAppSettingsInput,
  MeAppSettingsView,
  QuoteRequestInput,
  ShippingOption,
  ShippingProviderStatus,
  ShippingSettings,
} from '@ecommerce/shared/contracts'
import { ERROR_CODES, addBusinessDays } from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { getSetting, setSetting } from '../../shared/settings.js'
import { appError, conflict, isAppError, notFound, validationError } from '../../shared/errors.js'
import { audit, type AuditContext } from '../../shared/audit.js'
import {
  buildAuthorizeUrl,
  completeAuthorization,
  credentialProblemOf,
  forgetConnection,
  getConnectionStatus,
  getValidAccessToken,
  meRedirectUri,
  savePendingState,
  type MeCredentialProblem,
} from '../../integrations/melhor-envio/index.js'
import { revalidateStorefront } from '../../integrations/storefront/revalidate.js'
import { availableOf, productionDaysOf, splitLine } from '../inventory/domain/availability.js'
import { toPackages, type PackItem } from './domain/packing.js'
import { planAppSettingsUpdate, toAppSettingsView } from './domain/provider-app.js'
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

type QuoteLine = { pack: PackItem; madeToOrder: number; productionDays: number | null }

/**
 * Carrega peso/dimensões/preço das variantes pedidas e monta os itens de
 * cubagem — e, de cada linha, quanto seria produzido sob encomenda se o pedido
 * fechasse agora (a mesma conta do carrinho).
 */
const loadQuoteLines = async (items: QuoteRequestInput['items']): Promise<QuoteLine[]> => {
  const ids = items.map((i) => i.variantId)
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: ids }, storeId: getActiveStoreId() },
    select: {
      id: true,
      price: true,
      weight: true,
      length: true,
      width: true,
      height: true,
      level: { select: { onHand: true, reserved: true } },
      product: { select: { stockPolicy: true, productionDays: true } },
    },
  })
  const byId = new Map(variants.map((v) => [v.id, v]))

  return items.map((i) => {
    const v = byId.get(i.variantId)
    if (!v) throw notFound('Produto')
    // Pronta entrega sem saldo cota como pronta: o carrinho já barra a linha.
    const split = splitLine({ policy: v.product.stockPolicy, available: availableOf(v.level), quantity: i.quantity })
    return {
      pack: {
        variantId: v.id,
        quantity: i.quantity,
        weightGrams: v.weight,
        lengthMm: v.length,
        widthMm: v.width,
        heightMm: v.height,
        priceCents: v.price,
      },
      madeToOrder: split?.madeToOrder ?? 0,
      productionDays: v.product.productionDays,
    }
  })
}

/**
 * `deliveryDays` = postagem da loja + transporte: é o número que vai para o
 * snapshot do pedido e que conta a partir do envio. A produção vem à parte,
 * porque depois do envio ela já passou.
 */
export const quoteShipping = async (input: QuoteRequestInput, now = new Date()): Promise<ShippingOption[]> => {
  const [fromZip, lines, config] = await Promise.all([
    originZip(),
    loadQuoteLines(input.items),
    getSetting('shipping'),
  ])
  const packItems = lines.map((l) => l.pack)

  const packages = toPackages(packItems)
  const options = await activeProvider.quote({ fromZip, toZip: input.zipCode, packages })

  const subtotalCents = packItems.reduce((sum, it) => sum + it.priceCents * it.quantity, 0)
  const freeShipping =
    config.freeShippingAboveCents !== null && subtotalCents >= config.freeShippingAboveCents
  const productionDays = productionDaysOf(lines)

  return options
    // Se a loja restringiu serviços, mantém só os habilitados; lista vazia = todos.
    .filter((o) => config.enabledServices.length === 0 || config.enabledServices.includes(o.id))
    .map((o) => {
      // Prazo adicional de manuseio (a loja leva X dias para postar).
      const deliveryDays = o.deliveryDays + config.additionalDays
      return {
        ...o,
        deliveryDays,
        priceCents: freeShipping ? 0 : o.priceCents,
        productionDays,
        estimatedDeliveryAt: addBusinessDays(now, productionDays + deliveryDays).toISOString(),
      }
    })
    .sort((a, b) => a.priceCents - b.priceCents)
}

// ─── Prazo de postagem ────────────────────────────────────────────────────────

/** O que o admin edita. No setting o campo se chama `additionalDays` (nome antigo). */
export const getShippingSettings = async (): Promise<ShippingSettings> => ({
  handlingDays: (await getSetting('shipping')).additionalDays,
})

/**
 * Grava o prazo de postagem mantendo o resto do setting (frete grátis e serviços
 * ainda não têm tela). A loja mostra o prazo na página do produto: revalida.
 */
export const updateShippingSettings = async (
  input: ShippingSettings,
  context: AuditContext,
): Promise<ShippingSettings> => {
  const current = await getSetting('shipping')
  if (current.additionalDays === input.handlingDays) return input

  await setSetting('shipping', { ...current, additionalDays: input.handlingDays })
  await audit({
    action: EVENTS.shipping.settingsUpdated,
    entityType: 'Store',
    entityId: getActiveStoreId(),
    changes: { handlingDays: { from: current.additionalDays, to: input.handlingDays } },
    context,
  })
  void revalidateStorefront()
  return input
}

// ─── Aplicativo do provider (credenciais, editadas no admin) ─────────────────

export const getProviderAppSettings = async (): Promise<MeAppSettingsView> =>
  toAppSettingsView(await getSetting('melhor_envio_app'), meRedirectUri())

/**
 * Grava as credenciais do app. Trocar de app ou de ambiente desconecta a conta
 * (os tokens eram do app anterior): o admin vê "Desconectado" e reconecta.
 */
export const updateProviderAppSettings = async (
  input: MeAppSettingsInput,
  context: AuditContext,
): Promise<MeAppSettingsView> => {
  const plan = planAppSettingsUpdate(await getSetting('melhor_envio_app'), input)
  if (!plan.ok) {
    throw validationError([{ field: 'clientSecret', message: 'Informe o Client Secret do aplicativo.' }])
  }
  if (Object.keys(plan.changes).length === 0) return toAppSettingsView(plan.next, meRedirectUri())
  // A confirmação do admin é a barreira de UX; esta é a garantia: nenhum cliente
  // da API derruba o frete sem dizer que sabe disso.
  if (plan.resetConnection && input.confirmDisconnect !== true) {
    throw conflict(
      'Esta troca desconecta a conta do Melhor Envio e tira o frete do ar. Confirme para continuar.',
      ERROR_CODES.CONFIRMATION_REQUIRED,
    )
  }

  await setSetting('melhor_envio_app', plan.next)
  if (plan.resetConnection) await forgetConnection()

  await audit({
    action: EVENTS.shipping.providerAppUpdated,
    entityType: 'Store',
    entityId: getActiveStoreId(),
    changes: { ...plan.changes, ...(plan.resetConnection ? { connection: { from: 'connected', to: 'reset' } } : {}) },
    context,
  })
  return toAppSettingsView(plan.next, meRedirectUri())
}

// ─── OAuth do provider (conexão da conta do lojista, uma vez) ────────────────

/**
 * Início do fluxo: gera o state anti-CSRF e devolve a URL de consentimento.
 *
 * Tem que rodar na API de PRODUÇÃO: o callback chega nela, e o state precisa
 * estar no banco que ela lê. Link gerado pela API de dev é o que falhou em 14/10.
 */
export const startProviderConnection = async (
  context: AuditContext,
): Promise<{ authorizeUrl: string }> => {
  const state = randomBytes(24).toString('hex')
  await savePendingState(state)

  await audit({
    action: EVENTS.shipping.providerConnectStarted,
    entityType: 'Store',
    entityId: getActiveStoreId(),
    context,
  })

  return { authorizeUrl: await buildAuthorizeUrl(state) }
}

/** Callback: valida o state, troca o código por tokens e persiste. */
export const finishProviderConnection = (code: string, state: string): Promise<void> =>
  completeAuthorization(code, state)

/**
 * O access token dura 30 dias e só era renovado quando uma cotação chegava perto
 * do vencimento. Loja com pouco tráfego deixou o refresh token vencer também, e o
 * frete caiu sem ninguém ver. Com 7 dias de folga, o job renova por volta do dia
 * 23 — haja ou não cliente cotando.
 */
const PROACTIVE_RENEWAL_MARGIN_MS = 7 * 24 * 60 * 60_000

/**
 * O job roda a cada 6h: depois de uma renovação bem-sucedida, faltam sempre
 * mais de ~6,75 dias. Com menos de 6, ele já falhou por um dia inteiro.
 */
const RENEWAL_OVERDUE_MS = PROACTIVE_RENEWAL_MARGIN_MS - 24 * 60 * 60_000

export const providerStatus = async (now = Date.now()): Promise<ShippingProviderStatus> => {
  const { connected, expiresAt } = await getConnectionStatus()
  return {
    connected,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    renewalOverdue: connected && expiresAt !== null && expiresAt - now < RENEWAL_OVERDUE_MS,
  }
}

export type ProviderRenewal = {
  status: ShippingProviderStatus
  /**
   * A renovação esbarrou na credencial do app (ausente ou recusada). A conexão
   * NÃO caiu — o status segue conectado —, mas cai quando o token vencer.
   */
  blockedBy: MeCredentialProblem | null
}

/**
 * Chamado pelo job periódico. Conta não conectada não é erro: só não há o que
 * renovar. A renovação RECUSADA também não: ela zera os tokens e lança
 * SHIPPING_UNAVAILABLE — devolver o status (agora desconectado) é o que deixa o
 * job avisar a equipe na mesma rodada, e não seis horas depois. O mesmo vale
 * para a renovação bloqueada pela credencial, que mantém os tokens.
 */
export const renewProviderToken = async (): Promise<ProviderRenewal> => {
  const before = await getConnectionStatus()
  let blockedBy: MeCredentialProblem | null = null
  if (before.connected) {
    try {
      await getValidAccessToken(PROACTIVE_RENEWAL_MARGIN_MS)
    } catch (err) {
      if (!isAppError(err) || err.code !== ERROR_CODES.SHIPPING_UNAVAILABLE) throw err
      blockedBy = credentialProblemOf(err)
    }
  }
  return { status: await providerStatus(), blockedBy }
}
