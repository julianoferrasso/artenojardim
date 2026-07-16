import { Router } from 'express'
import { loginSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff } from '../../middlewares/authenticate.js'
import { loginLimiter, refreshLimiter } from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/**
 * Sem `schemas.ts` neste módulo: os schemas de entrada vivem em
 * @ecommerce/shared/contracts, porque o formulário de login do admin valida com
 * exatamente os mesmos. Duplicar aqui criaria dois lugares para divergir.
 *
 * Sem `repository.ts`: o service faz chamadas Prisma diretas e simples.
 */
export const authRoutes: Router = Router()

// /auth/admin/* — staff. O fluxo de cliente é independente (Fase 1, item 7):
// cookie, segredo e endpoint diferentes, para que vazar um não vaze o outro.
authRoutes.post('/admin/login', loginLimiter, validate({ body: loginSchema }), controller.loginController)
authRoutes.post('/admin/refresh', refreshLimiter, controller.refreshController)
authRoutes.post('/admin/logout', controller.logoutController)
authRoutes.get('/admin/me', authenticate, requireStaff, controller.meController)
