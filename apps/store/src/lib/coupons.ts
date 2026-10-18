'use client'

import { ROUTES } from '@ecommerce/shared/constants'
import { ERROR_CODES, type AppliedCoupon } from '@ecommerce/shared/contracts'
import { clientFetch as call } from './client'
import { ApiError } from './api'
import { formatBRL } from './utils'

/** Confere o código contra o carrinho atual. O valor é prévia: o confirm recalcula. */
export const validateCoupon = (code: string): Promise<AppliedCoupon> =>
  call<AppliedCoupon>(ROUTES.coupons.validate, { method: 'POST', body: JSON.stringify({ code }) })

export const isCouponError = (err: unknown): boolean =>
  err instanceof ApiError && err.code.startsWith('COUPON_')

/** Mensagem por `code`, nunca pelo texto da API. */
export const couponErrorMessage = (err: unknown): string => {
  if (!(err instanceof ApiError)) return 'Não foi possível aplicar o cupom. Tente novamente.'
  switch (err.code) {
    case ERROR_CODES.COUPON_NOT_FOUND:
    case ERROR_CODES.VALIDATION_ERROR:
      return 'Cupom inválido.'
    case ERROR_CODES.COUPON_EXPIRED:
      return 'Este cupom expirou.'
    case ERROR_CODES.COUPON_USAGE_LIMIT_REACHED:
      return 'Este cupom esgotou.'
    case ERROR_CODES.COUPON_ALREADY_USED:
      return 'Você já usou este cupom.'
    case ERROR_CODES.COUPON_MIN_ORDER_NOT_MET: {
      const min = Number(err.details?.find((d) => d.field === 'minOrderValue')?.message)
      return min
        ? `Este cupom vale para pedidos a partir de ${formatBRL(min)} em produtos.`
        : 'O pedido não atingiu o valor mínimo deste cupom.'
    }
    case ERROR_CODES.COUPON_NOT_APPLICABLE:
      return 'Este cupom zera o pedido e não pode ser usado nesta compra.'
    case ERROR_CODES.RATE_LIMITED:
      return 'Muitas tentativas. Aguarde alguns minutos.'
    default:
      return err.message
  }
}
