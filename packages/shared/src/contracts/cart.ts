import { z } from 'zod'

/**
 * Contratos do carrinho. O cliente manda variantId + quantidade; NUNCA preço.
 * O backend lê o preço ao vivo da variante e recalcula o total — o front só exibe.
 */

export const addToCartSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive().max(99).default(1),
})

export type AddToCartInput = z.infer<typeof addToCartSchema>

export const updateCartItemSchema = z.object({
  // 0 remove o item; positivo ajusta a quantidade.
  quantity: z.number().int().nonnegative().max(99),
})

export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>

export const cartItemSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  productId: z.string(),
  productName: z.string(),
  productSlug: z.string(),
  variantLabel: z.string(),
  sku: z.string(),
  imageUrl: z.string().nullable(),
  /** Preço unitário AO VIVO, lido da variante agora. */
  unitPrice: z.number().int(),
  quantity: z.number().int(),
  lineTotal: z.number().int(),
  /** Disponível em estoque agora — o front avisa "só restam N" ou desabilita. */
  available: z.number().int(),
  /** false quando a variante saiu do ar ou o estoque zerou desde que foi adicionada. */
  purchasable: z.boolean(),
})

export type CartItem = z.infer<typeof cartItemSchema>

export const cartSchema = z.object({
  id: z.string(),
  items: z.array(cartItemSchema),
  /** Soma dos lineTotal dos itens compráveis. Frete e desconto entram no checkout. */
  subtotal: z.number().int(),
  itemCount: z.number().int(),
})

export type Cart = z.infer<typeof cartSchema>
