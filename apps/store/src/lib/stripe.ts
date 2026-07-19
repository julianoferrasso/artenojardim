'use client'

import { loadStripe, type Stripe } from '@stripe/stripe-js'

/**
 * A publishable NÃO vem de env do front: chega do backend no retorno de
 * getOrderPayment (fonte única — a chave já vive no .env da API). loadStripe é
 * caro e deve rodar uma vez por chave; memorizamos por publishable.
 */
const cache = new Map<string, Promise<Stripe | null>>()

export const getStripePromise = (publishableKey: string): Promise<Stripe | null> => {
  let p = cache.get(publishableKey)
  if (!p) {
    p = loadStripe(publishableKey)
    cache.set(publishableKey, p)
  }
  return p
}
