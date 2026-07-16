import { ERROR_CODES, type ErrorCode, type ErrorDetail } from '@ecommerce/shared/contracts'

/**
 * Erro de aplicação como FACTORY, não classe (docs/arquitetura.md §14).
 *
 * `class AppError extends Error` seria o único lugar onde uma classe é idiomática,
 * mas o custo de abrir a exceção à regra é maior que o ganho: um Error com
 * propriedades anexadas se comporta igual, mantém a stack, e sobrevive a
 * `instanceof` quebrado entre realms (o motivo real de isAppError usar uma flag).
 */

export type AppError = Error & {
  readonly isAppError: true
  readonly code: ErrorCode | string
  readonly status: number
  readonly details?: ErrorDetail[]
  /** Erro original de uma integração. Vai para o log, nunca para o cliente. */
  readonly cause?: unknown
}

export const appError = (
  code: ErrorCode | string,
  message: string,
  status: number,
  details?: ErrorDetail[],
  cause?: unknown,
): AppError => {
  const err = new Error(message)
  err.name = 'AppError'

  // Object.assign em vez de atribuição solta + cast: o tipo do retorno é
  // verificado de verdade, então esquecer um campo vira erro de compilação.
  return Object.assign(err, {
    isAppError: true as const,
    code,
    status,
    ...(details ? { details } : {}),
    ...(cause !== undefined ? { cause } : {}),
  })
}

export const isAppError = (err: unknown): err is AppError =>
  err instanceof Error && (err as Partial<AppError>).isAppError === true

// ── Atalhos ──────────────────────────────────────────────────────────────────

export const notFound = (resource: string): AppError =>
  appError(ERROR_CODES.NOT_FOUND, `${resource} não encontrado`, 404)

export const unauthorized = (message = 'Não autenticado'): AppError =>
  appError(ERROR_CODES.UNAUTHORIZED, message, 401)

export const forbidden = (message = 'Sem permissão para esta ação'): AppError =>
  appError(ERROR_CODES.FORBIDDEN, message, 403)

export const conflict = (message: string, code: ErrorCode = ERROR_CODES.CONFLICT): AppError =>
  appError(code, message, 409)

export const validationError = (details: ErrorDetail[]): AppError =>
  appError(ERROR_CODES.VALIDATION_ERROR, 'Dados inválidos', 422, details)

/**
 * Erro de negócio previsto: o front reage ao `code`, nunca ao texto.
 * Ex.: businessError(ERROR_CODES.INSUFFICIENT_STOCK, 'Restam apenas 2 unidades')
 */
export const businessError = (code: ErrorCode, message: string, status = 400): AppError =>
  appError(code, message, status)

/**
 * Fronteira de `integrations/`: erro de terceiro NUNCA vaza para o controller.
 * Um StripeCardError chegando cru no error-handler vira 500 e assusta o cliente
 * por um cartão recusado, que é um 400 perfeitamente normal.
 */
export const externalServiceError = (service: string, cause: unknown): AppError =>
  appError(
    ERROR_CODES.EXTERNAL_SERVICE_ERROR,
    `Serviço ${service} indisponível no momento. Tente novamente.`,
    503,
    undefined,
    cause,
  )
