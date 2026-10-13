'use client'

import { useState } from 'react'
import type { MercadoPagoOrderPayment } from '@ecommerce/shared/contracts'
import { PixPayment } from './pix-payment'
import { CardPaymentForm } from './card-payment'

type Method = 'PIX' | 'CARD'

/**
 * Escolha do meio no Mercado Pago. Pix vem primeiro: aprovação na hora, sem
 * parcelamento a explicar e a menor taxa para a loja. Um Pix ainda em aberto
 * (cliente recarregou a página) reabre direto nele.
 */
export function MercadoPagoPayment({
  orderId,
  payment,
  onPaid,
  onProcessing,
}: {
  orderId: string
  payment: MercadoPagoOrderPayment
  onPaid: () => void
  onProcessing: () => void
}) {
  const [method, setMethod] = useState<Method>('PIX')

  const option = (value: Method, title: string, hint: string) => (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm transition-colors has-checked:border-primary has-checked:bg-secondary/40">
      <input type="radio" name="payment-method" checked={method === value} onChange={() => setMethod(value)} />
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-muted-foreground">{hint}</span>
      </span>
    </label>
  )

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Forma de pagamento</legend>
        {option('PIX', 'Pix', 'Aprovação na hora')}
        {option('CARD', 'Cartão de crédito', 'Em até 12x')}
      </fieldset>

      {method === 'PIX' ? (
        <PixPayment orderId={orderId} initial={payment.pix} onPaid={onPaid} />
      ) : (
        <CardPaymentForm
          orderId={orderId}
          amount={payment.amount}
          payerEmail={payment.payerEmail}
          publicKey={payment.publicKey}
          onPaid={onPaid}
          onProcessing={onProcessing}
        />
      )}

      <p className="text-center text-xs text-muted-foreground">
        Pagamento processado com segurança pelo Mercado Pago.
      </p>
    </div>
  )
}
