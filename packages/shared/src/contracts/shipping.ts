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
}
