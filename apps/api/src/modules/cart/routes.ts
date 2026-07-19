import { Router } from 'express'
import { addToCartSchema, updateCartItemSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticateCustomer, optionalAuthenticateCustomer } from '../../middlewares/authenticate.js'
import * as controller from './controller.js'

/**
 * Carrinho: público com sessão anônima OU cliente logado, na mesma rota
 * (optionalAuthenticateCustomer). Sem repository — o service faz as queries
 * junto das regras de recálculo.
 */
export const cartRoutes: Router = Router()

cartRoutes.get('/', optionalAuthenticateCustomer, controller.getCartController)
cartRoutes.post('/items', optionalAuthenticateCustomer, validate({ body: addToCartSchema }), controller.addItemController)
cartRoutes.patch('/items/:itemId', optionalAuthenticateCustomer, validate({ body: updateCartItemSchema }), controller.updateItemController)
cartRoutes.delete('/items/:itemId', optionalAuthenticateCustomer, controller.removeItemController)

// Merge exige cliente logado (autentica de verdade — o sessionToken vem do cookie).
cartRoutes.post('/merge', authenticateCustomer, controller.mergeController)
