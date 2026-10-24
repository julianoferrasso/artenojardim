import { Router } from 'express'
import {
  adminOrderListQuerySchema,
  updateFulfillmentSchema,
  cancelOrderSchema,
  refundOrderSchema,
  internalNoteSchema,
  addOrderEventSchema,
  declineCancelRequestSchema,
} from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff } from '../../middlewares/authenticate.js'
import { requireMinRole } from '../../middlewares/authorize.js'
import * as controller from './controller.js'

/**
 * Superfície de STAFF dos pedidos. Módulo separado de `orders/` porque aquele
 * router inteiro está atrás de `authenticateCustomer` — misturar staff e cliente
 * no mesmo Router exigiria auth por rota, e uma rota esquecida vazaria pedido
 * alheio.
 *
 * Nenhum endpoint aqui aceita `paymentStatus`: pagamento é escrito só pelo
 * webhook do Stripe (regra 6).
 */
export const adminOrderRoutes: Router = Router()

adminOrderRoutes.use(authenticate, requireStaff)

adminOrderRoutes.get('/', validate({ query: adminOrderListQuerySchema }), controller.listController)
// Antes do `/:id`: senão "production-summary" seria lido como id de pedido.
adminOrderRoutes.get('/production-summary', controller.productionSummaryController)
adminOrderRoutes.get('/:id', controller.detailController)

adminOrderRoutes.patch(
  '/:id/fulfillment',
  validate({ body: updateFulfillmentSchema }),
  controller.fulfillmentController,
)
adminOrderRoutes.post('/:id/cancel', validate({ body: cancelOrderSchema }), controller.cancelController)

// Exigência de cargo onde sai dinheiro da conta: reembolsar, e aprovar o
// pedido de cancelamento (que estorna automaticamente).
adminOrderRoutes.post(
  '/:id/refund',
  requireMinRole('ADMIN'),
  validate({ body: refundOrderSchema }),
  controller.refundController,
)
adminOrderRoutes.post(
  '/:id/cancel-request/approve',
  requireMinRole('ADMIN'),
  controller.approveCancelRequestController,
)
// Recusar não mexe em dinheiro: quem atende pode responder.
adminOrderRoutes.post(
  '/:id/cancel-request/decline',
  validate({ body: declineCancelRequestSchema }),
  controller.declineCancelRequestController,
)

adminOrderRoutes.patch('/:id/note', validate({ body: internalNoteSchema }), controller.noteController)
adminOrderRoutes.post('/:id/events', validate({ body: addOrderEventSchema }), controller.addEventController)
