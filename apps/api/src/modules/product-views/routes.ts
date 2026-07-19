import { Router } from 'express'
import { trackProductViewSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import * as controller from './controller.js'

/**
 * Rota PÚBLICA: a vitrine dispara o beacon sem token. Sem auth de propósito — é
 * uma métrica de tráfego anônimo, não uma ação de usuário.
 */
export const productViewRoutes: Router = Router()

productViewRoutes.post('/', validate({ body: trackProductViewSchema }), controller.trackController)
