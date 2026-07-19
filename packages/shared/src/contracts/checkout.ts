import { z } from 'zod'
import { orderAddressSchema, orderShippingMethodSchema, orderItemSchema } from './orders.js'

/**
 * Contratos de checkout. O front manda IDS e ESCOLHAS, nunca valores: o endereço
 * pelo id, o serviço de frete pelo id da cotação. O backend recalcula tudo do
 * banco no summary e no confirm — um preço adulterado no DevTools é ignorado.
 */

export const checkoutSummaryRequestSchema = z.object({
  addressId: z.string().min(1, 'Escolha um endereço de entrega'),
  shippingServiceId: z.string().min(1, 'Escolha uma opção de frete'),
})

export type CheckoutSummaryRequest = z.infer<typeof checkoutSummaryRequestSchema>

export const confirmCheckoutSchema = checkoutSummaryRequestSchema.extend({
  customerNote: z.string().max(500).optional(),
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
    }),
  ),
  shippingAddress: orderAddressSchema,
  shippingMethod: orderShippingMethodSchema,
  subtotal: z.number().int(),
  discountTotal: z.number().int(),
  shippingTotal: z.number().int(),
  total: z.number().int(),
})

export type CheckoutSummary = z.infer<typeof checkoutSummarySchema>
