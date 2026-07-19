import { Router } from 'express'
import { stripeWebhookController } from './controller.js'

/**
 * Webhooks de serviços externos. Montado direto no app (não sob o prefixo com
 * rate-limit) e com express.raw ANTES do parser JSON — ver app.ts. Sem
 * autenticação de cliente: quem prova a origem é a assinatura do Stripe.
 */
export const stripeWebhookRoutes: Router = Router()

stripeWebhookRoutes.post('/', stripeWebhookController)
