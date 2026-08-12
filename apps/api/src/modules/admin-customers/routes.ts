import { Router } from 'express'
import {
  adminCustomerListQuerySchema,
  updateAdminCustomerSchema,
} from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff } from '../../middlewares/authenticate.js'
import { requireMinRole } from '../../middlewares/authorize.js'
import * as controller from './controller.js'

/**
 * Superfície de STAFF dos clientes. Ver e corrigir cadastro é trabalho de
 * atendimento, então o router é aberto ao staff — o desenho do admin-orders, não
 * o do admin-users (que fecha tudo em ADMIN).
 *
 * A anonimização é a exceção: destrói dado de forma irreversível e pede ADMIN.
 */
export const adminCustomerRoutes: Router = Router()

adminCustomerRoutes.use(authenticate, requireStaff)

adminCustomerRoutes.get('/', validate({ query: adminCustomerListQuerySchema }), controller.listController)
adminCustomerRoutes.get('/:id', controller.detailController)
adminCustomerRoutes.patch('/:id', validate({ body: updateAdminCustomerSchema }), controller.updateController)
adminCustomerRoutes.post('/:id/anonymize', requireMinRole('ADMIN'), controller.anonymizeController)
