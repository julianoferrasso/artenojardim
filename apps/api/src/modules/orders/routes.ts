import { Router } from 'express'
import { authenticateCustomer } from '../../middlewares/authenticate.js'
import * as controller from './controller.js'

/**
 * Pedidos do cliente. Tudo exige cliente logado; a posse é reforçada no service
 * pelo customerId. Admin de pedidos (separação, expedição) é outro módulo, Fase 1.15.
 */
export const orderRoutes: Router = Router()

orderRoutes.use(authenticateCustomer)
orderRoutes.get('/', controller.listController)
orderRoutes.get('/:id', controller.detailController)
orderRoutes.get('/:id/status', controller.statusController)
