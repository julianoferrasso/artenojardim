'use client'

import { useState } from 'react'
import Script from 'next/script'
import { CreditCard, Lock, QrCode, type LucideIcon } from 'lucide-react'
import type { MercadoPagoOrderPayment } from '@ecommerce/shared/contracts'
import { MP_SECURITY_SCRIPT } from '@/lib/mercadopago'
import { RadioCard } from '@/components/ui/radio-card'
import { CardBrands } from '@/components/payment-icons'
import { PixPayment } from './pix-payment'
import { CardPaymentForm } from './card-payment'

type Method = 'PIX' | 'CARD'

const MethodIcon = ({ icon: Icon }: { icon: LucideIcon }) => (
  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary-ink">
    <Icon className="size-4.5" strokeWidth={1.8} aria-hidden />
  </span>
)

/**
 * Escolha do meio no Mercado Pago. Pix vem primeiro: aprovação na hora, sem
 * parcelamento a explicar e a menor taxa para a loja. Um Pix ainda em aberto
 * (cliente recarregou a página) reabre direto nele.
 *
 * O Pix fica sempre montado (o polling segue com o cartão aberto); o cartão
 * monta na primeira abertura e depois só se esconde — desmontar o Brick apagaria
 * o que o cliente já digitou.
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
  const [cardOpened, setCardOpened] = useState(false)

  const select = (next: Method) => {
    setMethod(next)
    if (next === 'CARD') setCardOpened(true)
    // O painel de cima fecha e a opção escolhida sobe; o Safari não ancora a
    // rolagem, então ela é trazida de volta para a vista.
    requestAnimationFrame(() =>
      document.getElementById(`payment-${next}`)?.scrollIntoView({ block: 'nearest' }),
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Aqui e não no formulário do cartão: a coleta começa enquanto o cliente escolhe o meio. */}
      <Script id="mp-security" src={MP_SECURITY_SCRIPT} strategy="afterInteractive" />

      {/* min-w-0: o fieldset nasce com min-inline-size: min-content e, com o Brick
          dentro, estouraria a largura no celular. */}
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="sr-only">Forma de pagamento</legend>
        <RadioCard
          id="payment-PIX"
          name="payment-method"
          checked={method === 'PIX'}
          onSelect={() => select('PIX')}
          icon={<MethodIcon icon={QrCode} />}
          title="Pix"
          description="Aprovação imediata"
          panel={<PixPayment orderId={orderId} amount={payment.amount} initial={payment.pix} onPaid={onPaid} />}
        />
        <RadioCard
          id="payment-CARD"
          name="payment-method"
          checked={method === 'CARD'}
          onSelect={() => select('CARD')}
          icon={<MethodIcon icon={CreditCard} />}
          title="Cartão de crédito"
          description="Em até 12x"
          aside={<CardBrands className="hidden sm:flex" />}
          panel={
            cardOpened ? (
              <CardPaymentForm
                orderId={orderId}
                amount={payment.amount}
                payerEmail={payment.payerEmail}
                publicKey={payment.publicKey}
                onPaid={onPaid}
                onProcessing={onProcessing}
              />
            ) : null
          }
        />
      </fieldset>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Lock className="size-3.5 shrink-0" aria-hidden />
        Pagamentos processados pelo Mercado Pago, em ambiente seguro.
      </p>
    </div>
  )
}
