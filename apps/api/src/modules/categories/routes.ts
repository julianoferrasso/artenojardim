import { Router } from 'express'
import { createCategorySchema, updateCategorySchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff } from '../../middlewares/authenticate.js'
import * as controller from './controller.js'

/**
 * Leitura é PÚBLICA (a loja mostra o menu de categorias); escrita exige staff.
 * Sem repository.ts: o service faz chamadas Prisma diretas. A regra de árvore
 * que vale isolar mora em domain/tree.ts, não num repository.
 */
export const categoryRoutes: Router = Router()

// Público
categoryRoutes.get('/tree', controller.treeController)
categoryRoutes.get('/', controller.listController)
categoryRoutes.get('/:id', controller.detailController)

// Staff
categoryRoutes.post(
  '/',
  authenticate,
  requireStaff,
  validate({ body: createCategorySchema }),
  controller.createController,
)
categoryRoutes.patch(
  '/:id',
  authenticate,
  requireStaff,
  validate({ body: updateCategorySchema }),
  controller.updateController,
)
categoryRoutes.delete('/:id', authenticate, requireStaff, controller.deleteController)
