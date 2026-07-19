'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Order } from '@ecommerce/shared/contracts'
import { useAuth } from '@/lib/auth'
import { getOrder } from '@/lib/checkout'
import { formatBRL } from '@/lib/utils'

/**
 * Confirmação do pedido. O pagamento (Pix/boleto/cartão) entra na Fase 1.12 — por
 * enquanto o pedido nasce PENDING e esta tela confirma que ele foi registrado e
 * o estoque, reservado. É também onde o polling de status viverá.
 */

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: 'Aguardando pagamento',
  PROCESSING: 'Processando pagamento',
  PAID: 'Pago',
  FAILED: 'Pagamento não aprovado',
  REFUNDED: 'Reembolsado',
  PARTIALLY_REFUNDED: 'Parcialmente reembolsado',
}

export default function OrderConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { customer, loading: authLoading } = useAuth()
  const router = useRouter()
  const [order, setOrder] = useState<Order | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!authLoading && !customer) router.replace('/entrar')
  }, [authLoading, customer, router])

  useEffect(() => {
    if (!customer) return
    void getOrder(id)
      .then(setOrder)
      .catch(() => setNotFound(true))
  }, [customer, id])

  if (authLoading || (customer && !order && !notFound)) {
    return <main className="mx-auto max-w-2xl px-4 py-12 text-center text-muted-foreground">Carregando…</main>
  }
  if (notFound) {
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-3xl">✓</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Pedido #{order.number} registrado</h1>
        <p className="mt-1 text-sm text-muted-foreground">{PAYMENT_LABEL[order.paymentStatus]}</p>
      </div>

      <section className="mb-4 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 font-medium">Itens</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                {i.quantity}× {i.productName}
                {i.variantName !== '—' ? ` (${i.variantName})` : ''}
              </span>
              <span>{formatBRL(i.totalPrice)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-4 rounded-lg border border-border bg-card p-5 text-sm">
        <h2 className="mb-2 font-medium">Entrega</h2>
        <p className="text-muted-foreground">
          {a.recipient} · {a.street}, {a.number}
          {a.complement ? ` — ${a.complement}` : ''} · {a.district} · {a.city}/{a.state} · {a.zipCode}
        </p>
        <p className="mt-1 text-muted-foreground">
          {order.shippingMethod.carrier} · {order.shippingMethod.service} · {order.shippingMethod.deliveryDays} dias
        </p>
      </section>

      <section className="mb-6 rounded-lg border border-border bg-card p-5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatBRL(order.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Frete</span>
          <span>{formatBRL(order.shippingTotal)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
          <span>Total</span>
          <span>{formatBRL(order.total)}</span>
        </div>
      </section>

      <div className="rounded-md bg-muted p-4 text-center text-sm text-muted-foreground">
        O pagamento estará disponível em breve. Guardamos o seu pedido e reservamos o estoque.
      </div>

      <Link
        href="/"
        className="mt-6 block rounded-md border border-border px-4 py-3 text-center text-sm hover:bg-accent"
      >
        Continuar comprando
      </Link>
    </main>
  )
}
