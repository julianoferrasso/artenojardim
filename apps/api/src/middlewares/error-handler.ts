import type { ErrorRequestHandler, RequestHandler } from 'express'
import { Prisma } from '@prisma/client'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { isAppError, appError } from '../shared/errors.js'
import { isProduction } from '../config/env.js'
import { logger } from '../config/logger.js'

/**
 * O ÚNICO lugar que traduz erro → HTTP. Nenhum controller monta res.status(500).
 *
 * Erro esperado (AppError) → o status e o code que ele declara.
 * Erro do Prisma → traduzido para um code estável.
 * Erro inesperado → log com stack + requestId, e 500 genérico para o cliente.
 */

/** P2002 = unique violation; P2025 = registro não encontrado. */
const fromPrisma = (err: Prisma.PrismaClientKnownRequestError) => {
  if (err.code === 'P2002') {
    const target = (err.meta?.['target'] as string[] | undefined)?.join(', ') ?? 'campo'
    return appError(ERROR_CODES.CONFLICT, `Já existe um registro com este ${target}`, 409)
  }
  if (err.code === 'P2025') {
    return appError(ERROR_CODES.NOT_FOUND, 'Registro não encontrado', 404)
  }
  return undefined
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.requestId
  const log = req.log ?? logger

  const known =
    (isAppError(err) ? err : undefined) ??
    (err instanceof Prisma.PrismaClientKnownRequestError ? fromPrisma(err) : undefined)

  if (known) {
    // 5xx é falha nossa e vai como erro; 4xx é o cliente errando e é rotina.
    const level = known.status >= 500 ? 'error' : 'info'
    log[level]({ err: known, cause: known.cause, code: known.code, status: known.status }, known.message)

    return res.status(known.status).json({
      error: {
        code: known.code,
        message: known.message,
        ...(known.details ? { details: known.details } : {}),
        requestId,
      },
    })
  }

  log.error({ err }, 'erro não tratado')

  // Stack trace é um mapa do sistema para um atacante. Fica no log, nunca na
  // resposta. Em dev vaza a mensagem porque quem lê é você.
  res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: isProduction
        ? 'Erro interno. Tente novamente.'
        : err instanceof Error
          ? err.message
          : 'Erro desconhecido',
      requestId,
    },
  })
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `Rota não encontrada: ${req.method} ${req.path}`,
      requestId: req.requestId,
    },
  })
}
