import { z } from 'zod'

/**
 * Fonte da verdade dos enums para o FRONT. O `schema.prisma` declara os mesmos
 * valores para o BANCO — a duplicação é inevitável, porque o browser não pode
 * importar `@prisma/client`.
 *
 * O que impede a divergência silenciosa é `apps/api/test/enum-drift.test.ts`,
 * que compara os dois lados. Mudou aqui, mude lá.
 */

export const USER_ROLES = ['OWNER', 'ADMIN', 'STAFF'] as const
export const userRoleSchema = z.enum(USER_ROLES)
export type UserRole = z.infer<typeof userRoleSchema>

/** Hierarquia implícita: quem está acima pode o que está abaixo. */
export const ROLE_RANK: Record<UserRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  STAFF: 1,
}

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const
export const productStatusSchema = z.enum(PRODUCT_STATUSES)
export type ProductStatus = z.infer<typeof productStatusSchema>

export const PAYMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PAID',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES)
export type PaymentStatus = z.infer<typeof paymentStatusSchema>

export const FULFILLMENT_STATUSES = [
  'UNFULFILLED',
  'PICKING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
] as const
export const fulfillmentStatusSchema = z.enum(FULFILLMENT_STATUSES)
export type FulfillmentStatus = z.infer<typeof fulfillmentStatusSchema>

export const PAYMENT_METHODS = ['CARD', 'PIX', 'BOLETO'] as const
export const paymentMethodSchema = z.enum(PAYMENT_METHODS)
export type PaymentMethod = z.infer<typeof paymentMethodSchema>

/**
 * Movimento de estoque. Sinal fica em `quantity`, não no tipo.
 * Reserva NÃO está aqui: reserva é intenção, movimento é fato físico.
 */
export const MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE',
  'RETURN',
  'CANCELLATION',
  'ADJUSTMENT',
  'COUNT',
] as const
export const movementTypeSchema = z.enum(MOVEMENT_TYPES)
export type MovementType = z.infer<typeof movementTypeSchema>

export const COUPON_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING'] as const
export const couponTypeSchema = z.enum(COUPON_TYPES)
export type CouponType = z.infer<typeof couponTypeSchema>

export const SHIPMENT_STATUSES = [
  'PENDING',
  'LABEL_PURCHASED',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
] as const
export const shipmentStatusSchema = z.enum(SHIPMENT_STATUSES)
export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>
