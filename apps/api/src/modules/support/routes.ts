import { Router } from 'express'
import {
  supportReplySchema,
  supportStatusSchema,
  supportThreadListQuerySchema,
} from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff } from '../../middlewares/authenticate.js'
import * as controller from './controller.js'

/**
 * Atendimento no painel. Aberto ao staff: responder cliente é trabalho de quem
 * atende. O que mexe em dinheiro (aprovar cancelamento com estorno) mora em
 * `admin-orders`, com a exigência de cargo de lá.
 */
export const adminSupportRoutes: Router = Router()

adminSupportRoutes.use(authenticate, requireStaff)

adminSupportRoutes.get('/summary', controller.summaryController)
adminSupportRoutes.get('/threads', validate({ query: supportThreadListQuerySchema }), controller.listController)
adminSupportRoutes.get('/threads/:id', controller.detailController)
adminSupportRoutes.post('/threads/:id/messages', validate({ body: supportReplySchema }), controller.replyController)
adminSupportRoutes.patch('/threads/:id', validate({ body: supportStatusSchema }), controller.statusController)
