import Stripe from 'stripe'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { env } from '../../config/env.js'
import { appError } from '../../shared/errors.js'
import { getStripe } from './client.js'

/**
 * Evento do Stripe já verificado e traduzido para um formato NEUTRO — o módulo de
 * webhooks reage a isto, nunca ao tipo do SDK. Só os eventos que nos interessam
 * viram variantes ricas; o resto cai em `ignored` (registrado, mas sem efeito).
 */
export type StripeWebhookEvent =
  | { id: string; type: 'payment_intent.succeeded'; paymentIntentId: string; orderId: string | null }
  | { id: string; type: 'payment_intent.payment_failed'; paymentIntentId: string; orderId: string | null }
  | { id: string; type: 'ignored'; rawType: string }

const mapEvent = (event: Stripe.Event): StripeWebhookEvent => {
  if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
    const pi = event.data.object as Stripe.PaymentIntent
    return {
      id: event.id,
      type: event.type,
      paymentIntentId: pi.id,
      orderId: pi.metadata?.['orderId'] ?? null,
    }
  }
  return { id: event.id, type: 'ignored', rawType: event.type }
}

/**
 * Verifica a assinatura com o corpo CRU e o STRIPE_WEBHOOK_SECRET. Assinatura
 * inválida (ou secret ausente) lança AppError — o controller vira isso em 4xx sem
 * vazar detalhe. É a fronteira que garante que só o Stripe fala com este endpoint.
 */
export const constructWebhookEvent = (rawBody: Buffer, signature: string): StripeWebhookEvent => {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw appError(ERROR_CODES.EXTERNAL_SERVICE_ERROR, 'Webhook de pagamento não configurado.', 503)
  }
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    // Assinatura não confere: corpo adulterado, secret errado ou requisição forjada.
    throw appError(ERROR_CODES.UNAUTHORIZED, 'Assinatura de webhook inválida.', 400, undefined, err)
  }
  return mapEvent(event)
}
