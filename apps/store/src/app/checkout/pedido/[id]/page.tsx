'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { CustomerOrder, OrderPayment } from '@ecommerce/shared/contracts'
import { PAYMENT_STATUS_LABEL as PAYMENT_LABEL } from '@ecommerce/shared/constants'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { getOrder, getOrderPayment, getOrderStatus } from '@/lib/checkout'
import { OrderItemList, OrderDeliveryCard, OrderTotals } from '@/components/order-summary'
import { StripePayment } from './stripe-payment'
import { MercadoPagoPayment } from './mercadopago-payment'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Tela do pedido — o FUNIL DE PAGAMENTO, não um recibo. O pedido nasce PENDING
 * (Fase 1.11) e é aqui que ele é pago, pelo provedor ativo na API: Mercado Pago
 * (Pix + cartão, o padrão) ou Stripe (standby). A tela nunca decide o pagamento:
 * o cartão aprovado volta PAID da própria API; Pix e análises esperam o webhook,
 * observado por polling do status.
 *
 * O histórico do pedido vive em /conta/pedidos/[id]. Esta tela morre quando o
 * pagamento termina; aquela é para sempre.
 */

type Phase =
  | 'loading'
  | 'pay'
  | 'confirming'
  | 'paid'
  | 'failed'
  | 'timeout'
  | 'canceled'
  | 'unavailable'
  | 'notfound'

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { customer, loading: authLoading } = useAuth()
  const router = useRouter()

  const [order, setOrder] = useState<CustomerOrder | null>(null)
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
      let ord: CustomerOrder
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
      if (ord.canceledAt) {
        setPhase('canceled')
        return
      }

      // Voltando do redirect do Stripe (cartão/3DS): não renderiza o Element de
      // novo, só aguarda o webhook.
      if (/payment_intent=|redirect_status=/.test(window.location.search)) {
        setPhase('confirming')
        return
      }

      try {
        const pay = await getOrderPayment(id)
        if (cancelled) return
        setPayment(pay)
        // Cartão em análise no MP: não oferece outro pagamento, espera o veredito.
        setPhase(pay.provider === 'MERCADO_PAGO' && pay.cardPending ? 'confirming' : 'pay')
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.code === 'ORDER_NOT_PAYABLE') setPhase('canceled')
        else setPhase('unavailable')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [customer, id])

  const markPaid = useCallback(() => {
    setOrder((o) => (o ? { ...o, paymentStatus: 'PAID' } : o))
    setPhase('paid')
  }, [])

  const waitConfirmation = useCallback(() => setPhase('confirming'), [])

  // Polling do status enquanto confirma (cartão em análise, retorno do Stripe).
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
            markPaid()
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
  }, [phase, id, markPaid])

  if (authLoading || phase === 'loading') {
    return <main className="mx-auto max-w-2xl px-4 py-12 text-center text-muted-foreground">Carregando…</main>
  }
  if (phase === 'notfound') {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Pedido não encontrado</h1>
        <Link href="/" className="mt-6 inline-block text-sm text-primary-ink hover:underline">
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
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 rounded-xl border border-border bg-card p-6 text-center shadow-soft">
        <p className="text-3xl">{paid ? '✓' : '🛒'}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
          {paid ? `Pedido #${order.number} confirmado` : `Pedido #${order.number}`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {phase === 'canceled' ? 'Pedido cancelado' : PAYMENT_LABEL[paid ? 'PAID' : order.paymentStatus]}
        </p>
      </div>

      {/* Bloco de pagamento — o miolo do funil. */}
      {phase === 'pay' && payment && (
        <section className="mb-4 rounded-xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-4 font-medium">Pagamento</h2>
          {payment.provider === 'MERCADO_PAGO' ? (
            <MercadoPagoPayment
              orderId={id}
              payment={payment}
              onPaid={markPaid}
              onProcessing={waitConfirmation}
            />
          ) : (
            payment.clientSecret && <StripePayment payment={payment} returnUrl={returnUrl} />
          )}
        </section>
      )}

      {phase === 'confirming' && (
        <section className="mb-4 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
          <p className="animate-pulse">Confirmando seu pagamento…</p>
          <p className="mt-1">Isso costuma levar poucos segundos. Você pode deixar esta página aberta.</p>
        </section>
      )}

      {phase === 'failed' && (
        <section className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm">
          <p className="text-destructive">Seu pagamento não foi aprovado.</p>
          <button
            onClick={() => {
              startedPolling.current = false
              setPhase('loading')
              router.replace(`/checkout/pedido/${id}`)
              // Recarrega para reabrir o pagamento do zero.
              setTimeout(() => window.location.reload(), 0)
            }}
            className={cn(buttonVariants({ variant: 'neutral', emphasis: 'quiet', size: 'sm' }), 'mt-3')}
          >
            Tentar novamente
          </button>
        </section>
      )}

      {phase === 'timeout' && (
        <section className="mb-4 rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
          Ainda não recebemos a confirmação do pagamento. Assim que ele for aprovado, seu pedido
          será atualizado — você pode recarregar esta página para verificar.
        </section>
      )}

      {phase === 'unavailable' && (
        <section className="mb-4 rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
          O pagamento está indisponível no momento. Tente de novo em alguns minutos — seu pedido
          continua reservado por enquanto.
        </section>
      )}

      {phase === 'canceled' && (
        <section className="mb-4 rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
          Este pedido foi cancelado e não pode mais ser pago.
        </section>
      )}

      {paid && (
        <section className="mb-4 rounded-lg bg-success/10 p-4 text-center text-sm text-success">
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
          couponCode={order.couponCodeSnapshot}
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/conta/pedidos/${order.id}`}
          className={cn(buttonVariants(), 'flex-1')}
        >
          Acompanhar pedido
        </Link>
        <Link
          href="/"
          className={cn(buttonVariants({ variant: 'neutral', emphasis: 'quiet' }), 'flex-1')}
        >
          Continuar comprando
        </Link>
      </div>
    </main>
  )
}
