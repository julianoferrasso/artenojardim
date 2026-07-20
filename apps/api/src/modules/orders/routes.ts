import { Router } from 'express'
import {
  customerOrderListQuerySchema,
  customerCancelSchema,
  supportMessageSchema,
} from '@ecommerce/shared/contracts'
import { authenticateCustomer } from '../../middlewares/authenticate.js'
import { validate } from '../../middlewares/validate.js'
import {
  orderCancelLimiter,
  orderSupportLimiter,
  orderReorderLimiter,
} from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/**
 * Pedidos do cliente. Tudo exige cliente logado; a posse é reforçada no service
 * pelo customerId. Admin de pedidos (separação, expedição) é outro módulo.
 *
 * `authenticateCustomer` como `use` do router e não por rota: uma rota nova
 * esquecida aqui viraria vazamento de pedido alheio, e o esquecimento é o
 * modo de falha mais provável. Também é o que garante que `req.auth.sub` já
 * existe quando os limitadores por cliente rodam.
 */
export const orderRoutes: Router = Router()

orderRoutes.use(authenticateCustomer)

orderRoutes.get('/', validate({ query: customerOrderListQuerySchema }), controller.listController)
orderRoutes.get('/:id', controller.detailController)
orderRoutes.get('/:id/status', controller.statusController)
orderRoutes.get('/:id/payment', controller.paymentController)

orderRoutes.post(
  '/:id/cancel',
  orderCancelLimiter,
  validate({ body: customerCancelSchema }),
  controller.cancelController,
)
orderRoutes.post(
  '/:id/support',
  orderSupportLimiter,
  validate({ body: supportMessageSchema }),
  controller.supportController,
)
orderRoutes.post('/:id/reorder', orderReorderLimiter, controller.reorderController)
