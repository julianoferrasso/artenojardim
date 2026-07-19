import { Router } from 'express'
import { API_VERSION } from '@ecommerce/shared/constants'
import { healthRoutes } from './modules/health/routes.js'
import { authRoutes } from './modules/auth/routes.js'
import { uploadRoutes } from './modules/uploads/routes.js'

/**
 * Montagem de todos os módulos. Os caminhos vêm de shared/constants — renomear
 * uma rota quebra o build do front, em vez de virar 404 em produção.
 *
 * Fase 1 ainda monta aqui: store, products, categories, cart, checkout, orders,
 * payments, customers, uploads, cms, settings.
 */
export const apiRoutes: Router = Router()

apiRoutes.use('/health', healthRoutes)
apiRoutes.use('/auth', authRoutes)
apiRoutes.use('/uploads', uploadRoutes)

export const API_PREFIX = `/api/${API_VERSION}`
