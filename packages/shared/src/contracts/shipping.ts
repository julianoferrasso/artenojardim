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
  deliveryDays: z.number().int().nonnegative(),
})

export type ShippingOption = z.infer<typeof shippingOptionSchema>
