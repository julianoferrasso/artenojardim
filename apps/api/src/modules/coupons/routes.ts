import { Router } from 'express'
import {
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
} from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import {
  authenticate,
  authenticateCustomer,
  requireStaff,
} from '../../middlewares/authenticate.js'
import { couponValidateLimiter } from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/**
 * Gestão: requireStaff, como produtos — o STAFF já define preço, e cupom é
 * preço com outro nome. Toda ação de escrita é auditada no service.
 */
export const adminCouponRoutes: Router = Router()

adminCouponRoutes.use(authenticate, requireStaff)

adminCouponRoutes.get('/', controller.listController)
adminCouponRoutes.post('/', validate({ body: createCouponSchema }), controller.createController)
adminCouponRoutes.patch(
  '/:id',
  validate({ body: updateCouponSchema }),
  controller.updateController,
)
adminCouponRoutes.delete('/:id', controller.deleteController)

/** O cliente confere um código contra o próprio carrinho, antes de confirmar. */
export const couponRoutes: Router = Router()

couponRoutes.post(
  '/validate',
  authenticateCustomer,
  couponValidateLimiter,
  validate({ body: validateCouponSchema }),
  controller.validateController,
)
