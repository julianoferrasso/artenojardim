import { ERROR_CODES } from '@ecommerce/shared/contracts'
import type { CouponType } from '@ecommerce/shared/constants'

/**
 * Este cupom vale para este pedido, e quanto ele desconta?
 *
 * Funções PURAS — sem Prisma, sem Date.now(): o `now` e a contagem de usos vêm
 * de quem chama. O limite total aqui é só a resposta rápida; quem o garante sob
 * concorrência é o UPDATE atômico do service, dentro da transação do pedido.
 */

export type CouponRule = {
  type: CouponType
  value: number
  isActive: boolean
  startsAt: Date | null
  endsAt: Date | null
  minOrderValue: number | null
  usageLimit: number | null
  usageCount: number
  usageLimitPerCustomer: number | null
}

export type CouponIneligibility =
  | typeof ERROR_CODES.COUPON_NOT_FOUND
  | typeof ERROR_CODES.COUPON_EXPIRED
  | typeof ERROR_CODES.COUPON_USAGE_LIMIT_REACHED
  | typeof ERROR_CODES.COUPON_ALREADY_USED
  | typeof ERROR_CODES.COUPON_MIN_ORDER_NOT_MET

export type EligibilityContext = {
  now: Date
  /** Subtotal dos produtos, antes do desconto. */
  subtotal: number
  /** Pedidos não cancelados deste cliente com este cupom. */
  customerUses: number
}

export const checkCouponEligibility = (
  coupon: CouponRule,
  ctx: EligibilityContext,
): CouponIneligibility | null => {
  // Inativo e agendado respondem como inexistente: "começa sexta" revelaria a
  // campanha da Black Friday a quem chutou o código.
  if (!coupon.isActive) return ERROR_CODES.COUPON_NOT_FOUND
  if (coupon.startsAt && ctx.now < coupon.startsAt) return ERROR_CODES.COUPON_NOT_FOUND
  if (coupon.endsAt && ctx.now > coupon.endsAt) return ERROR_CODES.COUPON_EXPIRED
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return ERROR_CODES.COUPON_USAGE_LIMIT_REACHED
  }
  if (coupon.usageLimitPerCustomer !== null && ctx.customerUses >= coupon.usageLimitPerCustomer) {
    return ERROR_CODES.COUPON_ALREADY_USED
  }
  if (coupon.minOrderValue !== null && ctx.subtotal < coupon.minOrderValue) {
    return ERROR_CODES.COUPON_MIN_ORDER_NOT_MET
  }
  return null
}

export type CouponDiscount = {
  /** Abatido do subtotal dos produtos. */
  products: number
  /** Abatido do frete. */
  shipping: number
}

export const computeCouponDiscount = (
  coupon: Pick<CouponRule, 'type' | 'value'>,
  amounts: { subtotal: number; shipping: number },
): CouponDiscount => {
  switch (coupon.type) {
    case 'PERCENTAGE':
      return { products: Math.round((amounts.subtotal * coupon.value) / 100), shipping: 0 }
    case 'FIXED_AMOUNT':
      return { products: Math.min(coupon.value, amounts.subtotal), shipping: 0 }
    case 'FREE_SHIPPING':
      return { products: 0, shipping: amounts.shipping }
  }
}
