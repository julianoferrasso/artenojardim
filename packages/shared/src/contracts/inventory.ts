import { z } from 'zod'
import { movementTypeSchema } from '../constants/enums.js'

/**
 * Contratos do estoque. O admin registra movimentos que o ADMIN pode disparar
 * (PURCHASE, RETURN, ADJUSTMENT, COUNT). SALE e CANCELLATION são do SISTEMA
 * (webhook de pagamento) e não têm endpoint de entrada.
 */

export const ADMIN_MOVEMENT_TYPES = ['PURCHASE', 'RETURN', 'ADJUSTMENT', 'COUNT'] as const
export const adminMovementTypeSchema = z.enum(ADMIN_MOVEMENT_TYPES)

export const recordMovementSchema = z
  .object({
    variantId: z.string().min(1),
    type: adminMovementTypeSchema,
    /**
     * PURCHASE/RETURN: quantidade positiva a somar.
     * ADJUSTMENT: pode ser ± (perda = negativo).
     * COUNT: NÃO manda quantity — manda `counted` (a contagem física), e o
     *        backend calcula a diferença.
     */
    quantity: z.number().int().optional(),
    counted: z.number().int().nonnegative().optional(),
    reason: z.string().max(300).optional(),
  })
  .refine((v) => (v.type === 'COUNT' ? v.counted !== undefined : v.quantity !== undefined), {
    message: 'COUNT exige `counted`; os demais exigem `quantity`',
  })
  .refine((v) => (v.type === 'ADJUSTMENT' ? !!v.reason : true), {
    message: 'ADJUSTMENT exige um motivo',
    path: ['reason'],
  })

export type RecordMovementInput = z.infer<typeof recordMovementSchema>

export const inventoryLevelSchema = z.object({
  variantId: z.string(),
  onHand: z.number().int(),
  reserved: z.number().int(),
  available: z.number().int(),
})

export type InventoryLevel = z.infer<typeof inventoryLevelSchema>

export const movementSchema = z.object({
  id: z.string(),
  type: movementTypeSchema,
  quantity: z.number().int(),
  reason: z.string().nullable(),
  reference: z.string().nullable(),
  runningBalance: z.number().int(),
  userName: z.string().nullable(),
  createdAt: z.string(),
})

export type Movement = z.infer<typeof movementSchema>

/** Extrato de uma variante: o nível atual + as linhas do ledger. */
export const variantLedgerSchema = z.object({
  variantId: z.string(),
  sku: z.string(),
  productName: z.string(),
  level: inventoryLevelSchema,
  movements: z.array(movementSchema),
})

export type VariantLedger = z.infer<typeof variantLedgerSchema>

/** Item da lista de estoque no admin. */
export const stockItemSchema = z.object({
  variantId: z.string(),
  sku: z.string(),
  productId: z.string(),
  productName: z.string(),
  variantLabel: z.string(),
  onHand: z.number().int(),
  reserved: z.number().int(),
  available: z.number().int(),
})

export type StockItem = z.infer<typeof stockItemSchema>
