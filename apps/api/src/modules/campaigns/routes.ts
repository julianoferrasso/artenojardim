import { Router } from 'express'
import { paginationQuerySchema, sendProductCampaignSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff } from '../../middlewares/authenticate.js'
import { campaignSendLimiter } from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/**
 * Campanhas de e-mail. Router INTEIRO atrás de staff: divulgar produto é
 * trabalho de loja, e um `use` cobre também a rota que alguém acrescentar
 * depois sem lembrar do guard.
 */
export const campaignRoutes: Router = Router()

campaignRoutes.use(authenticate, requireStaff)

campaignRoutes.get('/', validate({ query: paginationQuerySchema }), controller.listController)

campaignRoutes.get(
  '/product/:productId/preview',
  validate({ query: paginationQuerySchema }),
  controller.previewController,
)

campaignRoutes.post(
  '/product/:productId/send',
  campaignSendLimiter,
  validate({ body: sendProductCampaignSchema }),
  controller.sendController,
)
