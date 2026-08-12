import { Router } from 'express'
import { trackProductViewSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { optionalAuthenticateCustomer } from '../../middlewares/authenticate.js'
import { productViewLimiter } from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/**
 * Rota PÚBLICA: a vitrine dispara o beacon com ou sem sessão.
 *
 * `optionalAuthenticateCustomer` e não `authenticateCustomer`: o visitante
 * anônimo é a maior parte do tráfego e é dele que sai o número do dashboard. O
 * token, quando vem, só ACRESCENTA a linha nominal do cliente. Token inválido é
 * tratado como ausente — métrica não derruba página.
 */
export const productViewRoutes: Router = Router()

productViewRoutes.post(
  '/',
  productViewLimiter,
  optionalAuthenticateCustomer,
  validate({ body: trackProductViewSchema }),
  controller.trackController,
)
