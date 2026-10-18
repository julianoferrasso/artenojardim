import { Router } from 'express'
import { quoteRequestSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff } from '../../middlewares/authenticate.js'
import { requireMinRole } from '../../middlewares/authorize.js'
import { shippingQuoteLimiter } from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'
import { oauthCallbackSchema } from './schemas.js'

/**
 * Frete. A cotação é PÚBLICA (a loja calcula no produto, sem login), com limite
 * próprio porque cada chamada custa na API do Melhor Envio. A conexão da conta
 * (OAuth) é de admin; o callback é aberto mas protegido pelo `state` anti-CSRF,
 * pois quem o chama é a loja após o redirect — sem sessão de staff.
 */
export const shippingRoutes: Router = Router()

// Público
shippingRoutes.post(
  '/quote',
  shippingQuoteLimiter,
  validate({ body: quoteRequestSchema }),
  controller.quoteController,
)

// Callback OAuth (store → api). Aberto; a posse é o state.
shippingRoutes.post(
  '/melhor-envio/callback',
  validate({ body: oauthCallbackSchema }),
  controller.callbackController,
)

// Conectar troca a conta que paga os fretes da loja inteira: mesmo piso de
// cargo de Aparência. Ver o status é leitura — qualquer staff.
shippingRoutes.get(
  '/melhor-envio/connect',
  authenticate,
  requireMinRole('ADMIN'),
  controller.connectController,
)
shippingRoutes.get('/melhor-envio/status', authenticate, requireStaff, controller.statusController)
