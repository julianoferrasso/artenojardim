import type { RequestHandler } from 'express'
import { ROLE_RANK, type UserRole } from '@ecommerce/shared/constants'
import { forbidden, unauthorized } from '../shared/errors.js'

/**
 * RBAC com três papéis e hierarquia implícita. Nada de permissões granulares
 * (`product.create`, `order.refund`) agora: seriam duas tabelas, uma tela de
 * gestão e uma checagem em toda rota — para uma loja de 1 a 3 pessoas que
 * confiam umas nas outras. Nasce na Fase 4, quando houver 20 funcionários e o
 * dono quiser que o estagiário não emita reembolso.
 */

/** Exige um papel exato entre os listados. */
export const requireRole =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (req.auth?.type !== 'user') return next(unauthorized())
    if (!roles.includes(req.auth.role)) {
      return next(forbidden('Você não tem permissão para esta ação'))
    }
    next()
  }

/**
 * Exige o papel informado OU superior. `requireMinRole('ADMIN')` passa ADMIN e
 * OWNER — evita esquecer de incluir OWNER em toda lista, que é como o dono da
 * loja acaba sem acesso a uma tela.
 */
export const requireMinRole =
  (minimum: UserRole): RequestHandler =>
  (req, _res, next) => {
    if (req.auth?.type !== 'user') return next(unauthorized())
    if (ROLE_RANK[req.auth.role] < ROLE_RANK[minimum]) {
      return next(forbidden('Você não tem permissão para esta ação'))
    }
    next()
  }
