'use client'

import { useState } from 'react'
import { CardPayment } from '@mercadopago/sdk-react'
import { ApiError } from '@/lib/api'
import { createCardPayment } from '@/lib/checkout'
import { ensureMercadoPago, readMpDeviceId } from '@/lib/mercadopago'
import { declineMessage } from '@/lib/payment-messages'

/**
 * Cartão via Card Payment Brick: os dados do cartão nunca passam por nós — o
 * Brick (MercadoPago.js) os transforma num token de uso único, e é o token que
 * vai à API. Valor e e-mail que o Brick também manda são ignorados pela API: ela
 * cobra o total do pedido no banco.
 *
 * A resposta é síncrona: aprovado já volta PAID; em análise, a tela espera o
 * webhook; recusado volta 402 e o Brick fica para outra tentativa (rejeitar a
 * promise do onSubmit é o que o reabilita).
 */
export function CardPaymentForm({
  orderId,
  amount,
  payerEmail,
  publicKey,
  onPaid,
  onProcessing,
}: {
  orderId: string
  amount: number
  payerEmail: string
  publicKey: string
  onPaid: () => void
  onProcessing: () => void
}) {
  ensureMercadoPago(publicKey)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const submit = async (
    formData: {
      token: string
      payment_method_id: string
      installments: number
      payer: { identification?: { type?: string; number?: string } }
    },
    additional?: { paymentTypeId?: string },
  ): Promise<void> => {
    setError(null)
    const doc = formData.payer.identification
    const deviceId = readMpDeviceId()
    try {
      const result = await createCardPayment(orderId, {
        token: formData.token,
        paymentMethodId: formData.payment_method_id,
        paymentType: additional?.paymentTypeId === 'debit_card' ? 'debit_card' : 'credit_card',
        installments: formData.installments,
        identification: {
          type: doc?.type === 'CNPJ' ? 'CNPJ' : 'CPF',
          number: (doc?.number ?? '').replace(/\D/g, ''),
        },
        ...(deviceId ? { deviceId } : {}),
      })
      if (result.status === 'PAID') onPaid()
      else onProcessing()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PAYMENT_DECLINED') {
        setError(declineMessage(err.details?.find((d) => d.field === 'reason')?.message))
      } else if (err instanceof ApiError && (err.code === 'ORDER_NOT_PAYABLE' || err.code === 'RATE_LIMITED')) {
        setError(err.message)
      } else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        setError('Confira o CPF/CNPJ do titular e os dados do cartão.')
      } else {
        setError('Não foi possível processar o pagamento agora. Tente novamente em instantes.')
      }
      throw err
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {!ready && <p className="animate-pulse text-sm text-muted-foreground">Carregando o formulário seguro…</p>}
      <CardPayment
        locale="pt-BR"
        initialization={{ amount: amount / 100, payer: { email: payerEmail } }}
        customization={{
          paymentMethods: { maxInstallments: 12, types: { excluded: ['prepaid_card'] } },
        }}
        onSubmit={submit}
        onReady={() => setReady(true)}
        onError={() =>
          setError('Não foi possível carregar o formulário de cartão. Recarregue a página ou pague com Pix.')
        }
      />
    </div>
  )
}
