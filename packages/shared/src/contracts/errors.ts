import { z } from 'zod'

/**
 * Códigos de erro estáveis. O front reage ao CODE, nunca ao texto da message —
 * texto é para humanos e muda sem aviso.
 *
 * Adicionar código aqui é mudança de contrato: o front pode passar a tratá-lo.
 */
export const ERROR_CODES = {
  // Genéricos
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  REFRESH_REUSED: 'REFRESH_REUSED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',

  // Catálogo
  SLUG_ALREADY_EXISTS: 'SLUG_ALREADY_EXISTS',
  SKU_ALREADY_EXISTS: 'SKU_ALREADY_EXISTS',
  PRODUCT_NOT_PUBLISHABLE: 'PRODUCT_NOT_PUBLISHABLE',
  VARIANT_MISSING_WEIGHT: 'VARIANT_MISSING_WEIGHT',

  // Estoque
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  RESERVATION_EXPIRED: 'RESERVATION_EXPIRED',

  // Cupom
  COUPON_NOT_FOUND: 'COUPON_NOT_FOUND',
  COUPON_EXPIRED: 'COUPON_EXPIRED',
  COUPON_USAGE_LIMIT_REACHED: 'COUPON_USAGE_LIMIT_REACHED',
  COUPON_MIN_ORDER_NOT_MET: 'COUPON_MIN_ORDER_NOT_MET',

  // Checkout / frete / pagamento
  CART_EMPTY: 'CART_EMPTY',
  SHIPPING_UNAVAILABLE: 'SHIPPING_UNAVAILABLE',
  SHIPPING_QUOTE_EXPIRED: 'SHIPPING_QUOTE_EXPIRED',
  ADDRESS_REQUIRED: 'ADDRESS_REQUIRED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  ORDER_NOT_CANCELABLE: 'ORDER_NOT_CANCELABLE',

  // Uploads
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',

  // Integrações
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export const errorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
})

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
    requestId: z.string().optional(),
  }),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>
export type ErrorDetail = z.infer<typeof errorDetailSchema>
