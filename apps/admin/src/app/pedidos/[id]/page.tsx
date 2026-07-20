'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Printer, ClipboardList, ExternalLink } from 'lucide-react'
import type { AdminOrder } from '@ecommerce/shared/contracts'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { OrderSituationBadge } from '@/components/order-situation-badge'
import { OrderActions } from '@/components/order-actions'
import { OrderTimeline } from '@/components/order-timeline'
import { CopyButton } from '@/components/copy-button'
import { useOrder, useSetInternalNote } from '@/lib/orders'
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  FULFILLMENT_LABEL,
  formatAddress,
  formatPhone,
  formatZip,
} from '@/lib/order-labels'
import { formatBRL, formatDate } from '@/lib/utils'
import { ApiError } from '@/lib/api'

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: order, isLoading, error } = useOrder(id)

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : 'Pedido não encontrado.'}
        </p>
        <Link href="/pedidos" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Voltar para pedidos
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href="/pedidos"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground no-print"
          >
            <ArrowLeft className="size-4" />
            Pedidos
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">Pedido #{order.number}</h1>
            <OrderSituationBadge situation={order.situation} />
          </div>
          <p className="text-xs text-muted-foreground">
            Criado em {formatDate(order.createdAt)} · atualizado em {formatDate(order.updatedAt)}
          </p>
        </div>

        <div className="flex gap-2 no-print">
          <Button variant="outline" size="sm" asChild>
            <a href={`/pedidos/${order.id}/imprimir`} target="_blank" rel="noreferrer">
              <Printer className="size-4" />
              Imprimir
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/pedidos/${order.id}/separacao`} target="_blank" rel="noreferrer">
              <ClipboardList className="size-4" />
              Separação
            </a>
          </Button>
        </div>
      </header>

      {order.canceledAt && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <strong>Cancelado em {formatDate(order.canceledAt)}.</strong>{' '}
          {order.cancelReason && <span className="text-muted-foreground">{order.cancelReason}</span>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <ItemsCard order={order} />
          {order.customerNote && (
            <section className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-sm font-semibold">Observação do cliente</h2>
              <p className="mt-2 text-sm whitespace-pre-wrap">{order.customerNote}</p>
            </section>
          )}
          <OrderTimeline order={order} />
        </div>

        <aside className="flex flex-col gap-6">
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Ações</h2>
            <div className="mt-3">
              <OrderActions order={order} />
            </div>
            <Separator className="my-3" />
            <dl className="flex flex-col gap-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Pagamento</dt>
                <dd>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Expedição</dt>
                <dd>{FULFILLMENT_LABEL[order.fulfillmentStatus]}</dd>
              </div>
            </dl>
          </section>

          <CustomerCard order={order} />
          <AddressCard order={order} />
          <PaymentCard order={order} />
          <InternalNoteCard order={order} />
        </aside>
      </div>
    </div>
  )
}

const ItemsCard = ({ order }: { order: AdminOrder }) => (
  <section className="rounded-lg border border-border bg-card p-6">
    <h2 className="text-sm font-semibold">Itens</h2>

    <ul className="mt-4 flex flex-col divide-y divide-border">
      {order.items.map((item) => (
        <li key={item.id} className="flex gap-4 py-3 first:pt-0 last:pb-0">
          {item.imageUrl ? (
            // next/image exigiria configurar cada host de upload; a lista é curta
            // e as imagens já vêm dimensionadas do storage.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="size-14 shrink-0 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="size-14 shrink-0 rounded-md border border-dashed border-border" />
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.productName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.variantName} · SKU {item.sku}
            </p>
          </div>

          <div className="shrink-0 text-right text-sm">
            <p className="whitespace-nowrap">
              {item.quantity} × {formatBRL(item.unitPrice)}
            </p>
            <p className="font-medium whitespace-nowrap">{formatBRL(item.totalPrice)}</p>
          </div>
        </li>
      ))}
    </ul>

    <Separator className="my-4" />

    <dl className="flex flex-col gap-1.5 text-sm">
      <Row label="Subtotal" value={formatBRL(order.subtotal)} />
      {order.discountTotal > 0 && (
        <Row
          label={order.couponCodeSnapshot ? `Desconto (${order.couponCodeSnapshot})` : 'Desconto'}
          value={`− ${formatBRL(order.discountTotal)}`}
        />
      )}
      <Row label="Frete" value={formatBRL(order.shippingTotal)} />
      <Separator className="my-1" />
      <div className="flex justify-between gap-2 text-base font-semibold">
        <dt>Total</dt>
        <dd>{formatBRL(order.total)}</dd>
      </div>
    </dl>
  </section>
)

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-2">
    <dt className="text-muted-foreground">{label}</dt>
    <dd>{value}</dd>
  </div>
)

const CustomerCard = ({ order }: { order: AdminOrder }) => (
  <section className="rounded-lg border border-border bg-card p-4">
    <h2 className="text-sm font-semibold">Cliente</h2>
    <div className="mt-2 flex flex-col gap-1 text-sm">
      <p className="font-medium">{order.customer.name}</p>
      <a href={`mailto:${order.email}`} className="truncate text-primary hover:underline">
        {order.email}
      </a>
      {order.phone ?? order.customer.phone ? (
        <a
          href={`tel:${(order.phone ?? order.customer.phone)!.replace(/\D/g, '')}`}
          className="text-primary hover:underline"
        >
          {formatPhone(order.phone ?? order.customer.phone)}
        </a>
      ) : (
        <span className="text-muted-foreground">Sem telefone</span>
      )}
    </div>
  </section>
)

const AddressCard = ({ order }: { order: AdminOrder }) => {
  const a = order.shippingAddress
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Entrega</h2>
        <CopyButton value={formatAddress(a)} className="no-print" />
      </div>

      <address className="mt-2 text-sm not-italic leading-relaxed">
        {a.recipient}
        <br />
        {a.street}, {a.number}
        {a.complement ? ` - ${a.complement}` : ''}
        <br />
        {a.district}
        <br />
        {a.city} - {a.state}
        <br />
        CEP {formatZip(a.zipCode)}
      </address>

      <Separator className="my-3" />

      <p className="text-xs text-muted-foreground">
        {order.shippingMethod.carrier} · {order.shippingMethod.service}
        <br />
        {formatBRL(order.shippingMethod.priceCents)} · até {order.shippingMethod.deliveryDays} dia(s)
      </p>
    </section>
  )
}

const PaymentCard = ({ order }: { order: AdminOrder }) => {
  const payment = order.payments[0]

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Pagamento</h2>

      {!payment ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhuma tentativa de pagamento.</p>
      ) : (
        <dl className="mt-2 flex flex-col gap-1.5 text-sm">
          <Row label="Status" value={PAYMENT_STATUS_LABEL[payment.status]} />
          <Row
            label="Método"
            value={payment.method ? PAYMENT_METHOD_LABEL[payment.method] : '—'}
          />
          <Row label="Valor" value={formatBRL(payment.amount)} />
          {payment.refundedAmount > 0 && (
            <Row label="Reembolsado" value={formatBRL(payment.refundedAmount)} />
          )}
          {payment.paidAt && <Row label="Pago em" value={formatDate(payment.paidAt)} />}

          <div className="mt-2 flex flex-col gap-1">
            <dt className="text-xs text-muted-foreground">Transação</dt>
            <dd className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-1.5 py-1 text-xs">
                {payment.stripePaymentIntentId}
              </code>
              {payment.dashboardUrl && (
                <a
                  href={payment.dashboardUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Abrir no Stripe"
                  className="text-muted-foreground hover:text-foreground no-print"
                >
                  <ExternalLink className="size-4" />
                </a>
              )}
            </dd>
          </div>
        </dl>
      )}
    </section>
  )
}

const InternalNoteCard = ({ order }: { order: AdminOrder }) => {
  const [note, setNote] = useState(order.internalNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const save = useSetInternalNote(order.id)

  // O servidor é a verdade: outra aba (ou outro operador) pode ter alterado.
  useEffect(() => setNote(order.internalNote ?? ''), [order.internalNote])

  const dirty = note !== (order.internalNote ?? '')

  const submit = async () => {
    setError(null)
    try {
      await save.mutateAsync({ internalNote: note })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falha ao salvar.')
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 no-print">
      <h2 className="text-sm font-semibold">Observação interna</h2>
      <p className="mt-1 text-xs text-muted-foreground">Só o time vê. O cliente nunca.</p>

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        maxLength={2000}
        className="mt-2"
        placeholder="Ex.: embalar com plástico-bolha extra"
      />

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      <div className="mt-2 flex items-center justify-end gap-2">
        {saved && <span className="text-xs text-success">Salvo ✓</span>}
        <Button size="sm" disabled={!dirty || save.isPending} onClick={() => void submit()}>
          {save.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </section>
  )
}
