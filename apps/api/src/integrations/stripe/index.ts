/**
 * Fachada da integração com o Stripe. O módulo de pagamentos importa daqui — não
 * dos arquivos internos — para que a organização (client, payment-intents,
 * webhook) mude sem tocar em quem usa. O Stripe SDK só existe atrás desta porta.
 */
export { getPublishableKey } from './client.js'
export {
  createPaymentIntent,
  retrievePaymentIntent,
  type PaymentIntentResult,
} from './payment-intents.js'
export { createRefund, type RefundResult } from './refunds.js'
export { constructWebhookEvent, type StripeWebhookEvent } from './webhook.js'
