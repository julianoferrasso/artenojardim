import { Router } from 'express'
import { createStockNotificationSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { stockNotificationLimiter } from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/** Rota PÚBLICA: o painel do produto esgotado, para visitante anônimo ou logado. */
export const stockNotificationRoutes: Router = Router()

stockNotificationRoutes.post(
  '/',
  stockNotificationLimiter,
  validate({ body: createStockNotificationSchema }),
  controller.createController,
)
