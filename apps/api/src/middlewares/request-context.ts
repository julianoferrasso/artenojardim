import type { RequestHandler } from 'express'
import { randomUUID } from 'node:crypto'
import { logger } from '../config/logger.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string
      log: typeof logger
    }
  }
}

/**
 * requestId propagado para log, worker e resposta de erro. É o que transforma
 * "deu erro ontem à tarde" em uma linha de log encontrável.
 *
 * Aceita o header de um proxy à frente para não quebrar o rastro entre Nginx e API.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id']
  const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID()

  req.requestId = requestId
  req.log = logger.child({ requestId })
  res.setHeader('x-request-id', requestId)

  next()
}
