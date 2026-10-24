import { z } from 'zod'
import { stockPolicySchema } from '../constants/enums.js'
import { reorderSkipReasonSchema } from './customer-orders.js'

/**
 * Contratos do carrinho. O cliente manda variantId + quantidade; NUNCA preço.
 * O backend lê o preço ao vivo da variante e recalcula o total — o front só exibe.
 */

/** Teto por linha. Sem estoque para limitar (sob encomenda), é ele que segura. */
export const CART_MAX_LINE_QUANTITY = 99

export const addToCartSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive().max(CART_MAX_LINE_QUANTITY).default(1),
})

export type AddToCartInput = z.infer<typeof addToCartSchema>

export const updateCartItemSchema = z.object({
  // 0 remove o item; positivo ajusta a quantidade.
  quantity: z.number().int().nonnegative().max(CART_MAX_LINE_QUANTITY),
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
  stockPolicy: stockPolicySchema,
  /**
   * Quantas unidades desta linha seriam produzidas sob encomenda se o pedido
   * fechasse agora (0..quantity). No híbrido, o resto sai da prateleira.
   */
  madeToOrderQuantity: z.number().int().nonnegative(),
  /** Dias úteis de produção, só quando há parte sob encomenda; null se tudo é pronta entrega. */
  productionDays: z.number().int().nullable(),
  /** Até quanto o seletor de quantidade sobe: o disponível na pronta entrega, o teto da linha na encomenda. */
  maxQuantity: z.number().int().nonnegative(),
  /**
   * Por que não dá para comprar — o mesmo vocabulário do "comprar de novo". O
   * front escolhe a frase e a saída por aqui: remover (UNAVAILABLE, OUT_OF_STOCK)
   * ou ajustar a quantidade ao que resta (PARTIAL). null = comprável.
   */
  unavailableReason: reorderSkipReasonSchema.nullable(),
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
