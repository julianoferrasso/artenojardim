import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { env } from '../config/env.js'
import { appError, unauthorized } from '../shared/errors.js'
import { verifyAccessToken, type AccessClaims } from '../modules/auth/domain/tokens.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessClaims
    }
  }
}

const bearer = (req: Request): string | undefined => {
  const header = req.get('authorization')
  if (!header?.startsWith('Bearer ')) return undefined
  return header.slice(7).trim() || undefined
}

/**
 * Valida o access token e popula req.auth.
 *
 * ATENÇÃO: isto responde "quem é você", NUNCA "isto é seu". Verificação de posse
 * é no service — `GET /orders/:id` com authenticate e sem checar
 * `order.customerId === auth.sub` deixa qualquer cliente logado ler o pedido do
 * vizinho trocando o id na URL. É o IDOR, nº 1 do OWASP.
 */
export const authenticate: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = bearer(req)
  if (!token) return next(unauthorized('Token não informado'))

  const result = await verifyAccessToken(token, env.JWT_ACCESS_SECRET)

  if (!result.ok) {
    // "expirou" e "inválido" são erros DIFERENTES para o cliente: no primeiro
    // ele renova e repete de forma transparente; no segundo, alguém forjou e a
    // sessão deve morrer. Unificar faria o usuário legítimo ser deslogado a
    // cada 15 minutos.
    return next(
      result.reason === 'expired'
        ? appError(ERROR_CODES.TOKEN_EXPIRED, 'Token expirado', 401)
        : appError(ERROR_CODES.TOKEN_INVALID, 'Token inválido', 401),
    )
  }

  req.auth = result.claims
  next()
}

/** Garante que quem passou é STAFF, não cliente. Segredos diferentes já separam,
 *  mas o claim explícito documenta a intenção e protege de um erro de config. */
export const requireStaff: RequestHandler = (req, _res, next) => {
  if (req.auth?.type !== 'user') return next(unauthorized('Rota exclusiva do painel'))
  next()
}
