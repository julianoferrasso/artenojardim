'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Ban, CircleCheck, CircleX, Clock, LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { CustomerOrder, OrderPayment } from '@ecommerce/shared/contracts'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { getOrder, getOrderPayment, getOrderStatus } from '@/lib/checkout'
import { OrderItemList, OrderDeliveryCard, OrderTotals } from '@/components/order-summary'
import { OrderSituationBadge } from '@/components/order-situation-badge'
import { CheckoutSteps } from '@/components/checkout-steps'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StripePayment } from './stripe-payment'
import { MercadoPagoPayment } from './mercadopago-payment'
import { buttonVariants } from '@/components/ui/button'
import { ReadyByDate } from '@/components/ready-by-date'
import { cn, formatBRL } from '@/lib/utils'

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

const GRID = 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10'

const PageSkeleton = () => (
  <main className="mx-auto max-w-6xl px-4 py-8 lg:py-10" aria-busy="true">
    <Skeleton className="h-6 w-64" />
    <div className={cn(GRID, 'mt-6')}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
      </div>
    </div>
    <span className="sr-only">Carregando…</span>
  </main>
)

const PhaseNotice = ({
  icon: Icon,
  title,
  tone = 'muted',
  spin = false,
  live = false,
  action,
  children,
}: {
  icon: LucideIcon
  title: string
  tone?: 'muted' | 'destructive'
  spin?: boolean
  live?: boolean
  action?: React.ReactNode
  children?: React.ReactNode
}) => (
  <Card
    role={live ? 'status' : undefined}
    className={cn('flex gap-4 p-5', tone === 'destructive' && 'border-destructive/40 bg-destructive/5')}
  >
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full',
        tone === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className={cn('size-5', spin && 'animate-spin motion-reduce:animate-none')} aria-hidden />
    </span>
    <div className="min-w-0 text-sm">
      <p className={cn('font-medium', tone === 'destructive' ? 'text-destructive' : 'text-foreground')}>{title}</p>
      {children && <p className="mt-1 text-muted-foreground">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  </Card>
)

const OrderActions = ({ orderId, className }: { orderId: string; className?: string }) => (
  <div className={cn('flex flex-col gap-3 sm:flex-row', className)}>
    <Link href={`/conta/pedidos/${orderId}`} className={buttonVariants()}>
      Acompanhar pedido
    </Link>
    <Link href="/" className={buttonVariants({ variant: 'neutral', emphasis: 'quiet' })}>
      Continuar comprando
    </Link>
  </div>
)

/**
 * O que acontece agora: o pronto está garantido; o sob encomenda entra em
 * produção. A data é calculada no navegador a partir de agora — o pagamento
 * acabou de ser aprovado, e é dali que o prazo conta.
 */
const NextStep = ({ order }: { order: CustomerOrder }) => {
  if (order.productionDays <= 0) return <>Estoque garantido — em breve preparamos seu envio.</>
  const allMade = order.items.every((i) => i.madeToOrderQuantity >= i.quantity)
  return (
    <>
      {allMade
        ? 'Já vamos começar a produzir a sua encomenda.'
        : 'As peças prontas estão garantidas, e já vamos começar a produzir a encomenda.'}{' '}
      <ReadyByDate days={order.productionDays} prefix="Fica pronta até" /> Enviamos o pedido completo em
      seguida.
    </>
  )
}

const PaidHero = ({ order }: { order: CustomerOrder }) => {
  const headingRef = useRef<HTMLHeadingElement>(null)

  // O pagamento muda a tela inteira sem navegação: o foco no título faz o leitor
  // de tela anunciar a confirmação e traz a página para o topo.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <Card className="flex flex-col items-center px-6 py-8 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-success/10 text-success">
        <CircleCheck className="size-7" aria-hidden />
      </span>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 font-display text-3xl font-semibold tracking-tight outline-none md:text-4xl"
      >
        Pagamento confirmado!
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pedido #{order.number} · você vai receber a confirmação em{' '}
        <span className="font-medium text-foreground">{order.email}</span>.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        <NextStep order={order} />
      </p>
      <OrderActions orderId={order.id} className="mt-6 w-full sm:w-auto" />
    </Card>
  )
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { customer, loading: authLoading } = useAuth()
  const router = useRouter()

  const [order, setOrder] = useState<CustomerOrder | null>(null)
  const [payment, setPayment] = useState<OrderPayment | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const startedPolling = useRef(false)

  useEffect(() => {
    if (!authLoading && !customer) router.replace(`/entrar?next=${encodeURIComponent(`/checkout/pedido/${id}`)}`)
  }, [authLoading, customer, router, id])

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

  if (authLoading || phase === 'loading') return <PageSkeleton />
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

  const paid = phase === 'paid'
  const returnUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/checkout/pedido/${id}` : ''
  const itemCount = order.items.reduce((n, i) => n + i.quantity, 0)
  const reload = () => window.location.reload()
  const retry = () => {
    startedPolling.current = false
    setPhase('loading')
    router.replace(`/checkout/pedido/${id}`)
    // Recarrega para reabrir o pagamento do zero.
    setTimeout(() => window.location.reload(), 0)
  }
  const retryButton = (label: string, onClick: () => void) => (
    <button onClick={onClick} className={buttonVariants({ variant: 'neutral', emphasis: 'quiet', size: 'sm' })}>
      {label}
    </button>
  )

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:py-10">
      {!paid && <CheckoutSteps current="payment" />}

      <div className={cn(GRID, !paid && 'mt-6')}>
        <div className="flex min-w-0 flex-col gap-6">
          {paid ? (
            <PaidHero order={order} />
          ) : (
            <header>
              <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Finalize o pagamento
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>Pedido #{order.number}</span>
                <OrderSituationBadge situation={order.situation} />
              </div>
            </header>
          )}

          {/* Bloco de pagamento — o miolo do funil. */}
          {phase === 'pay' && payment && (
            <section aria-labelledby="payment-title" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="payment-title" className="text-lg font-medium">
                  Forma de pagamento
                </h2>
                <p className="text-sm text-muted-foreground">
                  Total <span className="text-base font-semibold text-foreground">{formatBRL(order.total)}</span>
                </p>
              </div>
              {payment.provider === 'MERCADO_PAGO' ? (
                <MercadoPagoPayment
                  orderId={id}
                  payment={payment}
                  onPaid={markPaid}
                  onProcessing={waitConfirmation}
                />
              ) : (
                payment.clientSecret && (
                  <Card className="p-5">
                    <StripePayment payment={payment} returnUrl={returnUrl} />
                  </Card>
                )
              )}
            </section>
          )}

          {phase === 'confirming' && (
            <PhaseNotice icon={LoaderCircle} spin live title="Confirmando seu pagamento…">
              Isso costuma levar poucos segundos. Você pode deixar esta página aberta.
            </PhaseNotice>
          )}

          {phase === 'failed' && (
            <PhaseNotice
              icon={CircleX}
              tone="destructive"
              title="Seu pagamento não foi aprovado."
              action={retryButton('Tentar novamente', retry)}
            />
          )}

          {phase === 'timeout' && (
            <PhaseNotice
              icon={Clock}
              title="Ainda não recebemos a confirmação do pagamento."
              action={retryButton('Atualizar', reload)}
            >
              Assim que ele for aprovado, seu pedido será atualizado — você pode recarregar esta página para
              verificar.
            </PhaseNotice>
          )}

          {phase === 'unavailable' && (
            <PhaseNotice
              icon={TriangleAlert}
              title="O pagamento está indisponível no momento."
              action={retryButton('Tentar novamente', reload)}
            >
              Tente de novo em alguns minutos — seu pedido continua reservado por enquanto.
            </PhaseNotice>
          )}

          {/* Também se chega aqui por ORDER_NOT_PAYABLE ao abrir o pagamento, que
              não é só cancelamento: o texto não afirma o motivo. */}
          {phase === 'canceled' && <PhaseNotice icon={Ban} title="Este pedido não pode mais ser pago." />}

          {(phase === 'failed' || phase === 'timeout' || phase === 'unavailable' || phase === 'canceled') && (
            <OrderActions orderId={order.id} />
          )}
        </div>

        <aside aria-label="Resumo do pedido" className="flex min-w-0 flex-col gap-4">
          <OrderTotals
            subtotal={order.subtotal}
            shippingTotal={order.shippingTotal}
            discountTotal={order.discountTotal}
            total={order.total}
            couponCode={order.couponCodeSnapshot}
          />
          {/* Sem link para o produto: no meio do pagamento, todo link é uma saída. */}
          <OrderItemList
            items={order.items.map((i) => ({ ...i, productSlug: null }))}
            title={`Itens (${itemCount})`}
          />
          <OrderDeliveryCard
            address={order.shippingAddress}
            method={order.shippingMethod}
            productionDays={order.productionDays}
          />
        </aside>
      </div>
    </main>
  )
}
