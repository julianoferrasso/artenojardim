import { Router } from 'express'
import { updateCustomerProfileSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticateCustomer } from '../../middlewares/authenticate.js'
import * as controller from './controller.js'

/**
 * Perfil do próprio cliente. Montado em /customers/me — DEPOIS do router de
 * endereços em routes.ts, porque o Express casa prefixo na ordem de registro e
 * `/customers/me` é prefixo de `/customers/me/addresses`.
 */
export const customerProfileRoutes: Router = Router()

customerProfileRoutes.use(authenticateCustomer)

customerProfileRoutes.patch('/', validate({ body: updateCustomerProfileSchema }), controller.updateController)
