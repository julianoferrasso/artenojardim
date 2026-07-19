import { Router } from 'express'
import { recordMovementSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff } from '../../middlewares/authenticate.js'
import * as controller from './controller.js'

/**
 * Estoque é 100% admin — nada de leitura pública. A loja mostra disponibilidade
 * a partir do produto (available), não expõe o ledger.
 *
 * Sem repository.ts: as queries vivem no service junto das invariantes de
 * transação. domain/ledger.ts tem as funções puras (saldo, extrato, COUNT).
 */
export const inventoryRoutes: Router = Router()

inventoryRoutes.use(authenticate, requireStaff)

inventoryRoutes.get('/', controller.listStockController)
inventoryRoutes.get('/reconcile', controller.reconcileController)
inventoryRoutes.get('/:variantId', controller.levelController)
inventoryRoutes.get('/:variantId/ledger', controller.ledgerController)
inventoryRoutes.post(
  '/movements',
  validate({ body: recordMovementSchema }),
  controller.recordMovementController,
)
