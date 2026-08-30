import { Router } from 'express'
import { createBannerSchema, updateBannerSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff, optionalAuthenticate } from '../../middlewares/authenticate.js'
import * as controller from './controller.js'

/**
 * GET com optionalAuthenticate, como em products: o público vê só os ativos na
 * projeção pública, o staff logado vê tudo na MESMA rota — sem duplicar
 * /cms/banners e /admin/banners, que sempre acabam divergindo.
 */
export const bannerRoutes: Router = Router()

bannerRoutes.get('/', optionalAuthenticate, controller.listController)

bannerRoutes.post(
  '/',
  authenticate,
  requireStaff,
  validate({ body: createBannerSchema }),
  controller.createController,
)
bannerRoutes.patch(
  '/:id',
  authenticate,
  requireStaff,
  validate({ body: updateBannerSchema }),
  controller.updateController,
)
bannerRoutes.delete('/:id', authenticate, requireStaff, controller.deleteController)
