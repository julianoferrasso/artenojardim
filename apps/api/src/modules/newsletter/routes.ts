import { Router } from 'express'
import { subscribeNewsletterSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { newsletterLimiter } from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/** Rota PÚBLICA: o footer/home da loja inscreve visitantes anônimos. */
export const newsletterRoutes: Router = Router()

newsletterRoutes.post(
  '/subscribe',
  newsletterLimiter,
  validate({ body: subscribeNewsletterSchema }),
  controller.subscribeController,
)
