import { Router } from 'express'
import { checkoutSummaryRequestSchema, confirmCheckoutSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticateCustomer } from '../../middlewares/authenticate.js'
import { checkoutConfirmLimiter } from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/**
 * Checkout. Exige cliente logado (guest checkout entra depois). O endereço e a
 * opção de frete vêm por id — o cliente já os escolheu em /customers/me/addresses
 * e /shipping/quote. Aqui o backend só recalcula e confirma.
 */
export const checkoutRoutes: Router = Router()

checkoutRoutes.use(authenticateCustomer)

checkoutRoutes.post(
  '/summary',
  validate({ body: checkoutSummaryRequestSchema }),
  controller.summaryController,
)
checkoutRoutes.post(
  '/confirm',
  checkoutConfirmLimiter,
  validate({ body: confirmCheckoutSchema }),
  controller.confirmController,
)
