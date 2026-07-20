import { Router } from 'express'
import {
  createStaffUserSchema,
  updateStaffUserSchema,
  resetStaffPasswordSchema,
  staffUserListQuerySchema,
  MANAGE_USERS_MIN_ROLE,
} from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff } from '../../middlewares/authenticate.js'
import { requireMinRole } from '../../middlewares/authorize.js'
import * as controller from './controller.js'

/**
 * `requireMinRole` aqui é o portão GROSSO — corta STAFF antes de qualquer query.
 * A decisão fina (quem pode mexer em quem) é do service, via canManageUser: a
 * rota conhece o papel de quem chega, não o de quem é alvo.
 *
 * Sem repository.ts nem domain/ local: as chamadas Prisma são triviais e o
 * domínio puro vive em contracts/staff-permissions.ts, compartilhado com o front.
 */
export const adminUserRoutes: Router = Router()

adminUserRoutes.use(authenticate, requireStaff, requireMinRole(MANAGE_USERS_MIN_ROLE))

adminUserRoutes.get('/', validate({ query: staffUserListQuerySchema }), controller.listController)
adminUserRoutes.post('/', validate({ body: createStaffUserSchema }), controller.createController)
adminUserRoutes.get('/:id', controller.detailController)
adminUserRoutes.patch('/:id', validate({ body: updateStaffUserSchema }), controller.updateController)

/**
 * Transições como POST, e não PATCH { isActive }. Desativar não é escrever um
 * campo: derruba as sessões do usuário. Um verbo próprio impede que a ação vire
 * um checkbox perdido no formulário de edição.
 */
adminUserRoutes.post('/:id/deactivate', controller.deactivateController)
adminUserRoutes.post('/:id/reactivate', controller.reactivateController)

adminUserRoutes.put(
  '/:id/password',
  validate({ body: resetStaffPasswordSchema }),
  controller.resetPasswordController,
)
