import { z } from 'zod'
import { zipCodeSchema } from '../constants/brazil.js'

/**
 * Contratos de frete. A cotação recebe o CEP de destino e os itens (variante +
 * quantidade) — nunca preço nem peso: o backend lê isso da variante, do banco. O
 * front manda só o que escolheu.
 */

export const quoteRequestSchema = z.object({
  zipCode: zipCodeSchema,
  items: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.number().int().positive().max(999),
      }),
    )
    .min(1, 'Informe ao menos um item'),
})

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>

/**
 * Uma opção de frete devolvida ao cliente. Preço em centavos (nunca decimal),
 * prazo em dias. `id` identifica o serviço do provider para revalidar no checkout.
 */
export const shippingOptionSchema = z.object({
  id: z.string(),
  carrier: z.string(),
  service: z.string(),
  priceCents: z.number().int().nonnegative(),
  /**
   * Dias ÚTEIS de postagem + transporte, contados do pagamento (pronta entrega)
   * ou do fim da produção. É o número que vai para o snapshot do pedido.
   */
  deliveryDays: z.number().int().nonnegative(),
  /** Dias úteis de produção antes da postagem; 0 quando tudo é pronta entrega. Igual em todas as opções. */
  productionDays: z.number().int().nonnegative(),
  /** ISO. Limite superior da entrega se o pagamento for aprovado hoje: produção + postagem + transporte. */
  estimatedDeliveryAt: z.string(),
})

export type ShippingOption = z.infer<typeof shippingOptionSchema>

/** Prazo de postagem: quantos dias úteis a loja leva para postar um pedido pronto. */
export const HANDLING_DAYS_MAX = 15

/** O que o admin edita do frete. Frete grátis e serviços habilitados ainda não têm tela. */
export const shippingSettingsSchema = z.object({
  handlingDays: z.number().int().min(0).max(HANDLING_DAYS_MAX),
})

export type ShippingSettings = z.infer<typeof shippingSettingsSchema>

/** Conexão da conta do provider de frete, para a tela Frete do admin. */
export type ShippingProviderStatus = {
  connected: boolean
  /** ISO. Vencimento do access token atual — renovado sozinho bem antes disso. */
  expiresAt: string | null
  /**
   * Conectado, mas a renovação automática está falhando há um dia ou mais
   * (credencial do app recusada, ou o ME fora do ar). Cai quando o token vencer.
   */
  renewalOverdue: boolean
}

// ─── Aplicativo do Melhor Envio (credenciais, editadas no admin) ─────────────

/** Produção e sandbox são contas e apps DIFERENTES no Melhor Envio. */
export const ME_ENVIRONMENTS = ['production', 'sandbox'] as const
export type MeEnvironment = (typeof ME_ENVIRONMENTS)[number]

/**
 * O que o admin grava. `clientSecret` vazio ou ausente = manter o atual: o
 * segredo nunca volta da API, então o formulário não tem como reenviá-lo.
 */
export const meAppSettingsSchema = z.object({
  environment: z.enum(ME_ENVIRONMENTS),
  clientId: z.string().trim().min(1, 'Informe o Client ID').max(64),
  clientSecret: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email('Informe um e-mail válido'),
  /**
   * Trocar de app ou de ambiente descarta a conexão atual e tira o frete do ar.
   * Sem `true` aqui, a API recusa com CONFIRMATION_REQUIRED.
   */
  confirmDisconnect: z.boolean().optional(),
})

export type MeAppSettingsInput = z.infer<typeof meAppSettingsSchema>

/** O que o admin lê. Do segredo, só os 4 últimos caracteres. */
export type MeAppSettingsView = {
  environment: MeEnvironment
  clientId: string | null
  clientSecretHint: string | null
  contactEmail: string | null
  /** Para colar no painel do Melhor Envio: é derivado do endereço da loja, não editável. */
  redirectUri: string
}
