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
  /// Token de e-mail inválido, expirado OU já usado. Um código para os três de
  /// propósito: distinguir "expirado" de "inexistente" confirmaria ao atacante
  /// que aquele token um dia existiu.
  EMAIL_TOKEN_INVALID: 'EMAIL_TOKEN_INVALID',
  EMAIL_ALREADY_VERIFIED: 'EMAIL_ALREADY_VERIFIED',
  /// Login recusado por falta de confirmação do e-mail. O front reage a este
  /// code oferecendo o reenvio — sem ele, o cliente lê "senha inválida" e não
  /// tem para onde ir.
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  /// CPF/CNPJ que já viajou para um pedido. A partir do primeiro pedido o
  /// documento é dado fiscal, não cadastro — corrigir depois reescreveria a
  /// identidade de uma venda já emitida.
  DOCUMENT_LOCKED: 'DOCUMENT_LOCKED',

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
  /// Cartão recusado pelo emissor: erro de negócio (402), não falha de servidor.
  PAYMENT_DECLINED: 'PAYMENT_DECLINED',
  ORDER_NOT_CANCELABLE: 'ORDER_NOT_CANCELABLE',

  // Campanhas de e-mail
  /// Este produto já teve o e-mail de novidade disparado. Trava de índice
  /// parcial no banco: anunciar duas vezes o mesmo lançamento queima a lista.
  CAMPAIGN_ALREADY_SENT: 'CAMPAIGN_ALREADY_SENT',
  /// Ninguém aceita marketing, ou o lojista desmarcou todo mundo.
  CAMPAIGN_NO_RECIPIENTS: 'CAMPAIGN_NO_RECIPIENTS',
  /// Divulgar rascunho manda o cliente para um 404 da loja.
  PRODUCT_NOT_ACTIVE: 'PRODUCT_NOT_ACTIVE',
  /// Token de descadastro adulterado ou de outra loja.
  UNSUBSCRIBE_TOKEN_INVALID: 'UNSUBSCRIBE_TOKEN_INVALID',

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
