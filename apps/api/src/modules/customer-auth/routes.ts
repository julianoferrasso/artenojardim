import { Router } from 'express'
import { loginSchema, registerSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticateCustomer } from '../../middlewares/authenticate.js'
import { loginLimiter, refreshLimiter, registerLimiter } from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/**
 * Auth de cliente. Montado em /auth (sem o /admin do staff): /auth/register,
 * /auth/login, /auth/refresh, /auth/logout, /auth/me. Os mesmos schemas de
 * login/register do staff (shared/contracts) — o formato é o mesmo, o segredo
 * e o cookie é que diferem.
 */
export const customerAuthRoutes: Router = Router()

customerAuthRoutes.post('/register', registerLimiter, validate({ body: registerSchema }), controller.registerController)
customerAuthRoutes.post('/login', loginLimiter, validate({ body: loginSchema }), controller.loginController)
customerAuthRoutes.post('/refresh', refreshLimiter, controller.refreshController)
customerAuthRoutes.post('/logout', controller.logoutController)
customerAuthRoutes.get('/me', authenticateCustomer, controller.meController)
