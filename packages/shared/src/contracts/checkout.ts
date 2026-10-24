import { z } from 'zod'
import { orderAddressSchema, orderShippingMethodSchema, orderItemSchema } from './orders.js'
import { couponCodeSchema } from './coupons.js'

/**
 * Contratos de checkout. O front manda IDS e ESCOLHAS, nunca valores: o endereço
 * pelo id, o serviço de frete pelo id da cotação. O backend recalcula tudo do
 * banco no summary e no confirm — um preço adulterado no DevTools é ignorado.
 */

export const checkoutSummaryRequestSchema = z.object({
  addressId: z.string().min(1, 'Escolha um endereço de entrega'),
  shippingServiceId: z.string().min(1, 'Escolha uma opção de frete'),
  /** Só o código: o desconto é revalidado e recalculado do banco. */
  couponCode: couponCodeSchema.optional(),
})

export type CheckoutSummaryRequest = z.infer<typeof checkoutSummaryRequestSchema>

export const confirmCheckoutSchema = checkoutSummaryRequestSchema.extend({
  customerNote: z.string().max(500).optional(),
  /**
   * O prazo de produção que o cliente VIU (o `productionDays` da opção de frete).
   * Se a confirmação der um prazo maior — a pronta entrega acabou no meio do
   * caminho —, a API recusa com PRODUCTION_TIME_CHANGED em vez de mudar a promessa
   * calada. Ausente = sem a guarda (cliente antigo).
   */
  expectedProductionDays: z.number().int().nonnegative().max(365).optional(),
})

export type ConfirmCheckoutInput = z.infer<typeof confirmCheckoutSchema>

/** Prévia do pedido (nada é criado): itens + endereço + frete + totais. */
export const checkoutSummarySchema = z.object({
  items: z.array(
    orderItemSchema.pick({
      productName: true,
      variantName: true,
      unitPrice: true,
      quantity: true,
      totalPrice: true,
      imageUrl: true,
      madeToOrderQuantity: true,
    }),
  ),
  shippingAddress: orderAddressSchema,
  shippingMethod: orderShippingMethodSchema,
  /** Dias úteis de produção do pedido, se fechasse agora (0 = tudo pronta entrega). */
  productionDays: z.number().int().nonnegative(),
  subtotal: z.number().int(),
  discountTotal: z.number().int(),
  shippingTotal: z.number().int(),
  total: z.number().int(),
})

export type CheckoutSummary = z.infer<typeof checkoutSummarySchema>
