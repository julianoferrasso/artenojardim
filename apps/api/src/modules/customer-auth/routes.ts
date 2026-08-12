import { Router } from 'express'
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticateCustomer } from '../../middlewares/authenticate.js'
import {
  forgotPasswordLimiter,
  loginLimiter,
  refreshLimiter,
  registerLimiter,
  resendVerificationLimiter,
  resetPasswordLimiter,
  verifyEmailLimiter,
} from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/**
 * Auth de cliente. Montado em /auth (sem o /admin do staff): /auth/register,
 * /auth/login, /auth/refresh, /auth/logout, /auth/me. Os mesmos schemas de
 * login/register do staff (shared/contracts) — o formato é o mesmo, o segredo
 * e o cookie é que diferem.
 *
 * As rotas de e-mail (confirmação e recuperação de senha) são todas PÚBLICAS: o
 * cliente que precisa delas é, por definição, quem não consegue autenticar.
 */
export const customerAuthRoutes: Router = Router()

customerAuthRoutes.post('/register', registerLimiter, validate({ body: registerSchema }), controller.registerController)
customerAuthRoutes.post('/login', loginLimiter, validate({ body: loginSchema }), controller.loginController)
customerAuthRoutes.post('/refresh', refreshLimiter, controller.refreshController)
customerAuthRoutes.post('/logout', controller.logoutController)
customerAuthRoutes.get('/me', authenticateCustomer, controller.meController)

customerAuthRoutes.post('/verify-email', verifyEmailLimiter, validate({ body: verifyEmailSchema }), controller.verifyEmailController)
customerAuthRoutes.post('/resend-verification', resendVerificationLimiter, validate({ body: resendVerificationSchema }), controller.resendVerificationController)
customerAuthRoutes.post('/forgot-password', forgotPasswordLimiter, validate({ body: forgotPasswordSchema }), controller.forgotPasswordController)
customerAuthRoutes.post('/reset-password', resetPasswordLimiter, validate({ body: resetPasswordSchema }), controller.resetPasswordController)
