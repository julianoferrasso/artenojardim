import { Router } from 'express'
import {
  changeEmailSchema,
  changePasswordSchema,
  deleteAccountSchema,
  updateCustomerProfileSchema,
} from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticateCustomer } from '../../middlewares/authenticate.js'
import {
  changeEmailLimiter,
  changePasswordLimiter,
  deleteAccountLimiter,
} from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/**
 * Perfil do próprio cliente. Montado em /customers/me — DEPOIS do router de
 * endereços em routes.ts, porque o Express casa prefixo na ordem de registro e
 * `/customers/me` é prefixo de `/customers/me/addresses`.
 */
export const customerProfileRoutes: Router = Router()

customerProfileRoutes.use(authenticateCustomer)

customerProfileRoutes.patch('/', validate({ body: updateCustomerProfileSchema }), controller.updateController)

/**
 * Credenciais têm VERBO PRÓPRIO, não são campos do PATCH: cada uma exige a senha
 * atual e tem consequência que um `data:` opcional esconderia — derrubar sessões,
 * ou trocar o endereço por onde a conta é recuperada.
 */
customerProfileRoutes.post(
  '/password',
  changePasswordLimiter,
  validate({ body: changePasswordSchema }),
  controller.changePasswordController,
)

customerProfileRoutes.post(
  '/email',
  changeEmailLimiter,
  validate({ body: changeEmailSchema }),
  controller.changeEmailController,
)
/** Cancelar não pede senha: só remove uma pendência, que é a direção segura. */
customerProfileRoutes.delete('/email', controller.cancelEmailChangeController)

customerProfileRoutes.get('/sessions', controller.listSessionsController)
customerProfileRoutes.delete('/sessions', controller.revokeSessionsController)

customerProfileRoutes.delete(
  '/',
  deleteAccountLimiter,
  validate({ body: deleteAccountSchema }),
  controller.deleteAccountController,
)
