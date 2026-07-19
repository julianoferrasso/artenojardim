import { Router } from 'express'
import {
  createProductSchema,
  updateProductSchema,
  updateProductImagesSchema,
  createVariantSchema,
  updateVariantSchema,
  productListQuerySchema,
} from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff, optionalAuthenticate } from '../../middlewares/authenticate.js'
import * as controller from './controller.js'

/**
 * GET com optionalAuthenticate: o público vê só ACTIVE, o staff logado vê tudo
 * (inclusive DRAFT) na MESMA rota — sem duplicar /products e /admin/products,
 * que sempre acabam divergindo (uma vira mais permissiva e ninguém percebe).
 *
 * repository.ts existe (query complexa reusada); domain/ tem cartesiano e regras
 * de publicação.
 */
export const productRoutes: Router = Router()

productRoutes.get(
  '/',
  optionalAuthenticate,
  validate({ query: productListQuerySchema }),
  controller.listController,
)
productRoutes.get('/:idOrSlug', optionalAuthenticate, controller.detailController)

productRoutes.post(
  '/',
  authenticate,
  requireStaff,
  validate({ body: createProductSchema }),
  controller.createController,
)
productRoutes.patch(
  '/:id',
  authenticate,
  requireStaff,
  validate({ body: updateProductSchema }),
  controller.updateController,
)
productRoutes.put(
  '/:id/images',
  authenticate,
  requireStaff,
  validate({ body: updateProductImagesSchema }),
  controller.updateImagesController,
)
productRoutes.post(
  '/:id/variants',
  authenticate,
  requireStaff,
  validate({ body: createVariantSchema }),
  controller.addVariantController,
)
productRoutes.patch(
  '/:id/variants/:variantId',
  authenticate,
  requireStaff,
  validate({ body: updateVariantSchema }),
  controller.updateVariantController,
)
productRoutes.delete(
  '/:id/variants/:variantId',
  authenticate,
  requireStaff,
  controller.removeVariantController,
)
productRoutes.delete('/:id', authenticate, requireStaff, controller.deleteController)
