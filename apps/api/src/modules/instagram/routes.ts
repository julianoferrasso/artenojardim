import { Router } from 'express'
import {
  createInstagramPostSchema,
  reorderInstagramPostsSchema,
  updateInstagramPostSchema,
} from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff, optionalAuthenticate } from '../../middlewares/authenticate.js'
import * as controller from './controller.js'

/** Mesmo desenho de banners: leitura pública e de staff na MESMA rota. */
export const instagramPostRoutes: Router = Router()

instagramPostRoutes.get('/', optionalAuthenticate, controller.listController)
instagramPostRoutes.post(
  '/',
  authenticate,
  requireStaff,
  validate({ body: createInstagramPostSchema }),
  controller.createController,
)
instagramPostRoutes.put(
  '/order',
  authenticate,
  requireStaff,
  validate({ body: reorderInstagramPostsSchema }),
  controller.reorderController,
)
instagramPostRoutes.patch(
  '/:id',
  authenticate,
  requireStaff,
  validate({ body: updateInstagramPostSchema }),
  controller.updateController,
)
instagramPostRoutes.delete('/:id', authenticate, requireStaff, controller.deleteController)
