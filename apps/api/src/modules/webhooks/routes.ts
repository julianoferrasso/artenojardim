import { Router } from 'express'
import { stripeWebhookController, mercadoPagoWebhookController } from './controller.js'

/**
 * Webhooks de serviços externos. Montados direto no app (não sob o prefixo com
 * rate-limit) — ver app.ts. Sem autenticação de cliente: quem prova a origem é
 * a assinatura do provedor.
 */
export const stripeWebhookRoutes: Router = Router()

stripeWebhookRoutes.post('/', stripeWebhookController)

export const mercadoPagoWebhookRoutes: Router = Router()

mercadoPagoWebhookRoutes.post('/', mercadoPagoWebhookController)
