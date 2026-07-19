import { Router } from 'express'
import { createAddressSchema, updateAddressSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticateCustomer } from '../../middlewares/authenticate.js'
import { globalLimiter } from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/**
 * Endereços exigem cliente logado; a posse é reforçada no service pelo customerId
 * (a rota autentica "quem é você", não "isto é seu"). Sem repository: o service
 * faz as queries junto das regras.
 */
export const addressRoutes: Router = Router()

addressRoutes.use(authenticateCustomer)
addressRoutes.get('/', controller.listController)
addressRoutes.post('/', validate({ body: createAddressSchema }), controller.createController)
addressRoutes.patch('/:id', validate({ body: updateAddressSchema }), controller.updateController)
addressRoutes.delete('/:id', controller.deleteController)

/**
 * Consulta de CEP — PÚBLICA e separada do CRUD: serve o guest checkout, que ainda
 * não tem conta. Rate limit próprio porque é uma chamada externa (ViaCEP) e não
 * pode ser abusada. Montada em /cep, fora de /customers/me.
 */
export const cepRoutes: Router = Router()
cepRoutes.get('/:cep', globalLimiter, controller.cepController)
