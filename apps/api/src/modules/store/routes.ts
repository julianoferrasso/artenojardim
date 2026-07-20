import { Router } from 'express'
import * as controller from './controller.js'

/** Rota PÚBLICA: a loja monta header/footer/título com estes dados. */
export const storeRoutes: Router = Router()

storeRoutes.get('/', controller.getPublicStoreController)
