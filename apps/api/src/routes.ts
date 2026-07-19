import { Router } from 'express'
import { API_VERSION } from '@ecommerce/shared/constants'
import { healthRoutes } from './modules/health/routes.js'
import { authRoutes } from './modules/auth/routes.js'
import { customerAuthRoutes } from './modules/customer-auth/routes.js'
import { uploadRoutes } from './modules/uploads/routes.js'
import { categoryRoutes } from './modules/categories/routes.js'
import { productRoutes } from './modules/products/routes.js'
import { inventoryRoutes } from './modules/inventory/routes.js'
import { cartRoutes } from './modules/cart/routes.js'
import { addressRoutes, cepRoutes } from './modules/addresses/routes.js'
import { shippingRoutes } from './modules/shipping/routes.js'
import { checkoutRoutes } from './modules/checkout/routes.js'
import { orderRoutes } from './modules/orders/routes.js'
import { productViewRoutes } from './modules/product-views/routes.js'
import { dashboardRoutes } from './modules/dashboard/routes.js'

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
// Staff usa /auth/admin/*; cliente usa /auth/{login,register,refresh,logout,me}.
// Caminhos distintos, sem conflito; os dois routers coexistem em /auth.
apiRoutes.use('/auth', customerAuthRoutes)
apiRoutes.use('/uploads', uploadRoutes)
apiRoutes.use('/categories', categoryRoutes)
apiRoutes.use('/products', productRoutes)
apiRoutes.use('/inventory', inventoryRoutes)
apiRoutes.use('/cart', cartRoutes)
apiRoutes.use('/customers/me/addresses', addressRoutes)
apiRoutes.use('/cep', cepRoutes)
apiRoutes.use('/shipping', shippingRoutes)
apiRoutes.use('/checkout', checkoutRoutes)
apiRoutes.use('/orders', orderRoutes)
apiRoutes.use('/product-views', productViewRoutes)
apiRoutes.use('/dashboard', dashboardRoutes)

export const API_PREFIX = `/api/${API_VERSION}`
