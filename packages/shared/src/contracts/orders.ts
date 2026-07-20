import { z } from 'zod'
import { paymentStatusSchema, fulfillmentStatusSchema } from '../constants/enums.js'

/**
 * Contratos de pedido (leitura). Tudo é snapshot do momento da compra — o pedido
 * é documento histórico, não uma view do catálogo atual. Valores em centavos.
 */

export const orderItemSchema = z.object({
  id: z.string(),
  productName: z.string(),
  variantName: z.string(),
  sku: z.string(),
  unitPrice: z.number().int(),
  quantity: z.number().int(),
  totalPrice: z.number().int(),
  imageUrl: z.string().nullable(),
})

export type OrderItem = z.infer<typeof orderItemSchema>

/** Endereço congelado no pedido (snapshot do Address no momento da compra). */
export const orderAddressSchema = z.object({
  recipient: z.string(),
  zipCode: z.string(),
  street: z.string(),
  number: z.string(),
  complement: z.string().nullable(),
  district: z.string(),
  city: z.string(),
  state: z.string(),
})

export type OrderAddress = z.infer<typeof orderAddressSchema>

/** Método de frete escolhido, congelado no pedido. */
export const orderShippingMethodSchema = z.object({
  carrier: z.string(),
  service: z.string(),
  serviceId: z.string(),
  priceCents: z.number().int(),
  deliveryDays: z.number().int(),
})

export const orderSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  paymentStatus: paymentStatusSchema,
  fulfillmentStatus: fulfillmentStatusSchema,
  email: z.string(),
  subtotal: z.number().int(),
  discountTotal: z.number().int(),
  shippingTotal: z.number().int(),
  total: z.number().int(),
  shippingAddress: orderAddressSchema,
  shippingMethod: orderShippingMethodSchema,
  items: z.array(orderItemSchema),
  customerNote: z.string().nullable(),
  createdAt: z.string(),
})

export type Order = z.infer<typeof orderSchema>

/** Resposta enxuta do polling de status (a tela de confirmação observa isto). */
export const orderStatusSchema = z.object({
  id: z.string(),
  paymentStatus: paymentStatusSchema,
  fulfillmentStatus: fulfillmentStatusSchema,
})

export type OrderStatus = z.infer<typeof orderStatusSchema>
