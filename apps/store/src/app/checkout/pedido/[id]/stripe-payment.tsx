'use client'

import { Elements } from '@stripe/react-stripe-js'
import type { StripeOrderPayment } from '@ecommerce/shared/contracts'
import { getStripePromise } from '@/lib/stripe'
import { PaymentForm } from './payment-form'

/**
 * Stripe (standby — volta com PAYMENT_PROVIDER=stripe na API). O confirmPayment
 * redireciona de volta a esta tela, e o polling do status assume dali.
 */
export function StripePayment({ payment, returnUrl }: { payment: StripeOrderPayment; returnUrl: string }) {
  return (
    <Elements
      stripe={getStripePromise(payment.publishableKey)}
      options={{ clientSecret: payment.clientSecret, appearance: { theme: 'stripe' } }}
    >
      <PaymentForm returnUrl={returnUrl} />
    </Elements>
  )
}
