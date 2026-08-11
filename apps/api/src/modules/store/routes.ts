import { Router } from 'express'
import { updateStoreThemeSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { requireMinRole } from '../../middlewares/authorize.js'
import * as controller from './controller.js'

/** Rota PÚBLICA: a loja monta header/footer/título/tema com estes dados. */
export const storeRoutes: Router = Router()

storeRoutes.get('/', controller.getPublicStoreController)

/**
 * Aparência da loja, só para o painel.
 *
 * `requireMinRole('ADMIN')` e não `requireStaff`: mudar a identidade visual da
 * loja inteira não é tarefa de quem embala pedido. Mesmo critério do
 * MANAGE_USERS_MIN_ROLE — passa ADMIN e OWNER.
 *
 * PUT e não PATCH: o tema é um documento único e o formulário sempre manda
 * todos os campos. Não há merge parcial a fazer.
 */
export const adminStoreRoutes: Router = Router()

adminStoreRoutes.use(authenticate, requireMinRole('ADMIN'))

adminStoreRoutes.get('/theme', controller.getThemeController)
adminStoreRoutes.put(
  '/theme',
  validate({ body: updateStoreThemeSchema }),
  controller.updateThemeController,
)
