import { Router } from 'express'
import { dashboardQuerySchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff } from '../../middlewares/authenticate.js'
import * as controller from './controller.js'

/** Só staff: são números do negócio (receita, ticket). */
export const dashboardRoutes: Router = Router()

dashboardRoutes.get(
  '/overview',
  authenticate,
  requireStaff,
  validate({ query: dashboardQuerySchema }),
  controller.overviewController,
)
