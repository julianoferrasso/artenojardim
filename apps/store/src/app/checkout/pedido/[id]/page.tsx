'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Elements } from '@stripe/react-stripe-js'
import type { Order, OrderPayment } from '@ecommerce/shared/contracts'
import { PAYMENT_STATUS_LABEL as PAYMENT_LABEL } from '@ecommerce/shared/constants'
import { useAuth } from '@/lib/auth'
import { getOrder, getOrderPayment, getOrderStatus } from '@/lib/checkout'
import { getStripePromise } from '@/lib/stripe'
import { OrderItemList, OrderDeliveryCard, OrderTotals } from '@/components/order-summary'
import { PaymentForm } from './payment-form'

/**
 * Tela do pedido — o FUNIL DE PAGAMENTO, não um recibo. O pedido nasce PENDING
 * (Fase 1.11) e é aqui que ele é pago: renderiza o Payment Element, e depois do
 * confirmPayment o Stripe redireciona de volta para cá. O polling do status
 * espera o webhook confirmar (PENDING→PAID); a tela nunca decide o pagamento.
 *
 * O histórico do pedido vive em /conta/pedidos/[id]. Esta tela morre quando o
 * pagamento termina; aquela é para sempre.
 */

type Phase = 'loading' | 'pay' | 'confirming' | 'paid' | 'failed' | 'timeout' | 'notfound'

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { customer, loading: authLoading } = useAuth()
  const router = useRouter()

  const [order, setOrder] = useState<Order | null>(null)
  const [payment, setPayment] = useState<OrderPayment | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const startedPolling = useRef(false)

  useEffect(() => {
    if (!authLoading && !customer) router.replace('/entrar')
  }, [authLoading, customer, router])

  // Carrega o pedido e decide o próximo passo.
  useEffect(() => {
    if (!customer) return
    let cancelled = false

    void (async () => {
      let ord: Order
      try {
        ord = await getOrder(id)
      } catch {
        if (!cancelled) setPhase('notfound')
        return
      }
      if (cancelled) return
      setOrder(ord)

      if (ord.paymentStatus === 'PAID') {
        setPhase('paid')
        return
      }

      // Voltando do redirect do Stripe (cartão/3DS/Pix) OU pagamento em
      // processamento: não renderiza o Element de novo, só aguarda o webhook.
      const returning = /payment_intent=|redirect_status=/.test(window.location.search)
      if (returning || ord.paymentStatus === 'PROCESSING') {
        setPhase('confirming')
        return
      }

      // Ainda a pagar: cria/reusa o PaymentIntent e mostra o Payment Element.
      try {
        const pay = await getOrderPayment(id)
        if (cancelled) return
        setPayment(pay)
        setPhase('pay')
      } catch {
        if (!cancelled) setPhase('timeout') // pagamento indisponível agora
      }
    })()

    return () => {
      cancelled = true
    }
  }, [customer, id])

  // Polling do status enquanto confirma (a verdade vem do webhook).
  useEffect(() => {
    if (phase !== 'confirming' || startedPolling.current) return
    startedPolling.current = true
    let cancelled = false

    void (async () => {
      for (let i = 0; i < 40 && !cancelled; i++) {
        try {
          const s = await getOrderStatus(id)
          if (cancelled) return
          if (s.paymentStatus === 'PAID') {
            setOrder((o) => (o ? { ...o, paymentStatus: 'PAID' } : o))
            setPhase('paid')
            return
          }
          if (s.paymentStatus === 'FAILED') {
            setPhase('failed')
            return
          }
        } catch {
          /* tenta de novo */
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
      if (!cancelled) setPhase('timeout')
    })()

    return () => {
      cancelled = true
    }
  }, [phase, id])

  if (authLoading || phase === 'loading') {
    return <main className="mx-auto max-w-2xl px-4 py-12 text-center text-muted-foreground">Carregando…</main>
  }
  if (phase === 'notfound') {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Pedido não encontrado</h1>
        <Link href="/" className="mt-6 inline-block text-sm text-primary hover:underline">
          Voltar à loja
        </Link>
      </main>
    )
  }
  if (!order) return null

  const a = order.shippingAddress
  const paid = phase === 'paid'
  const returnUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/checkout/pedido/${id}` : ''

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-3xl">{paid ? '✓' : '🛒'}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {paid ? `Pedido #${order.number} confirmado` : `Pedido #${order.number}`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {PAYMENT_LABEL[paid ? 'PAID' : order.paymentStatus]}
        </p>
      </div>

      {/* Bloco de pagamento — o miolo do funil. */}
      {phase === 'pay' && payment && payment.clientSecret && (
        <section className="mb-4 rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 font-medium">Pagamento</h2>
          <Elements
            stripe={getStripePromise(payment.publishableKey)}
            options={{ clientSecret: payment.clientSecret, appearance: { theme: 'stripe' } }}
          >
            <PaymentForm returnUrl={returnUrl} />
          </Elements>
        </section>
      )}

      {phase === 'confirming' && (
        <section className="mb-4 rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          <p className="animate-pulse">Confirmando seu pagamento…</p>
          <p className="mt-1">Se você pagou via Pix, a confirmação chega em instantes.</p>
        </section>
      )}

      {phase === 'failed' && (
        <section className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-5 text-sm">
          <p className="text-destructive">Seu pagamento não foi aprovado.</p>
          <button
            onClick={() => {
              startedPolling.current = false
              setPhase('loading')
              router.replace(`/checkout/pedido/${id}`)
              // Recarrega para reabrir o Payment Element com um novo intento.
              setTimeout(() => window.location.reload(), 0)
            }}
            className="mt-3 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Tentar novamente
          </button>
        </section>
      )}

      {phase === 'timeout' && (
        <section className="mb-4 rounded-md bg-muted p-4 text-center text-sm text-muted-foreground">
          Ainda não recebemos a confirmação do pagamento. Assim que ele for aprovado, seu pedido
          será atualizado — você pode recarregar esta página para verificar.
        </section>
      )}

      {paid && (
        <section className="mb-4 rounded-md bg-primary/5 p-4 text-center text-sm text-muted-foreground">
          Pagamento confirmado e estoque garantido. Em breve preparamos seu envio.
        </section>
      )}

      <div className="mb-6 flex flex-col gap-4">
        <OrderItemList items={order.items} />
        <OrderDeliveryCard address={a} method={order.shippingMethod} />
        <OrderTotals
          subtotal={order.subtotal}
          shippingTotal={order.shippingTotal}
          discountTotal={order.discountTotal}
          total={order.total}
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/conta/pedidos/${order.id}`}
          className="flex-1 rounded-md bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Acompanhar pedido
        </Link>
        <Link
          href="/"
          className="flex-1 rounded-md border border-border px-4 py-3 text-center text-sm hover:bg-accent"
        >
          Continuar comprando
        </Link>
      </div>
    </main>
  )
}
