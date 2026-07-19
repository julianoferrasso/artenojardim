'use client'

import { useState, type FormEvent } from 'react'
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'

/**
 * Formulário do Payment Element. Ao confirmar, o Stripe cuida de tudo — 3DS do
 * cartão, QR do Pix — e redireciona de volta ao `returnUrl` (a própria tela do
 * pedido). Lá, o polling do status assume: a verdade do pagamento é o webhook,
 * nunca a resposta do confirmPayment.
 */
export function PaymentForm({ returnUrl }: { returnUrl: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    setError(null)

    const { error: err } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    })

    // Só chega aqui se houve erro imediato (validação/cartão recusado na hora).
    // Sucesso e ações assíncronas (Pix, 3DS) redirecionam para o returnUrl.
    setSubmitting(false)
    setError(err?.message ?? 'Não foi possível processar o pagamento. Tente novamente.')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement />

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {submitting ? 'Processando…' : 'Pagar agora'}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Pagamento processado com segurança pela Stripe.
      </p>
    </form>
  )
}
