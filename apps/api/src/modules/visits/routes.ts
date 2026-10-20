import { Router } from 'express'
import { trackVisitSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { visitLimiter } from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/**
 * Rota PÚBLICA: a vitrine abre a sessão com ou sem cliente logado, e a visita não
 * é nominal — por isso nem `optionalAuthenticateCustomer` entra aqui.
 */
export const visitRoutes: Router = Router()

visitRoutes.post('/', visitLimiter, validate({ body: trackVisitSchema }), controller.trackController)
