'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { Truck, FileText, RotateCcw } from 'lucide-react'
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from '@ecommerce/shared/constants'
import type { ReorderResult } from '@ecommerce/shared/contracts'
import { ApiError } from '@/lib/api'
import { useMyOrder, useReorder } from '@/lib/orders'
import { useCart } from '@/lib/cart'
import { formatBRL, formatDateLong, formatDateTime } from '@/lib/utils'
import { OrderItemList, OrderDeliveryCard, OrderTotals } from '@/components/order-summary'
import { OrderSituationBadge } from '@/components/order-situation-badge'
import { OrderTimeline } from '@/components/order-timeline'
import { CancelOrderDialog } from '@/components/cancel-order-dialog'
import { SupportForm } from '@/components/support-form'

/**
 * Detalhe do pedido: o que foi comprado, para onde vai, como está e o que dá
 * para fazer a respeito.
 *
 * Rastreio e nota fiscal só aparecem quando existem — não há coluna para eles no
 * banco, e um bloco "Rastreio: —" sugeriria um dado atrasado em vez de um dado
 * que ainda não foi informado.
 */
export default function PedidoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: order, isLoading, isError, error } = useMyOrder(id)
  const [reorderResult, setReorderResult] = useState<ReorderResult | null>(null)
  const reorder = useReorder(id)
  const { refresh, openCart } = useCart()

  const buyAgain = async () => {
    setReorderResult(null)
    const result = await reorder.mutateAsync()
    setReorderResult(result)
    // O carrinho é outro contexto (não é Query): precisa ser avisado à mão.
    await refresh()
    if (result.added.length > 0) openCart()
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (isError || !order) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="text-sm text-muted-foreground">
          {notFound
            ? 'Pedido não encontrado.'
            : 'Não foi possível carregar este pedido. Tente novamente.'}
        </p>
        <Link href="/conta/pedidos" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Voltar para meus pedidos
        </Link>
      </div>
    )
  }

  const reorderable = order.items.some((i) => i.reorderable)

  return (
    <>
      <Link href="/conta/pedidos" className="text-sm text-muted-foreground hover:underline">
        ← Meus pedidos
      </Link>

      <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Pedido #{order.number}</h1>
        <OrderSituationBadge situation={order.situation} />
      </div>

      <p className="-mt-4 mb-6 text-sm text-muted-foreground">
        Realizado em {formatDateLong(order.createdAt)}
      </p>

      {order.cancelRequestedAt && !order.canceledAt && (
        <div className="mb-6 rounded-md bg-warning/10 p-4 text-sm text-warning-foreground">
          Você solicitou o cancelamento em {formatDateTime(order.cancelRequestedAt)}. Nossa equipe
          está analisando.
        </div>
      )}

      {reorderResult && (
        <div className="mb-6 rounded-md bg-primary/5 p-4 text-sm">
          {reorderResult.added.length > 0 && (
            <p>
              {reorderResult.added.length}{' '}
              {reorderResult.added.length === 1 ? 'item foi adicionado' : 'itens foram adicionados'}{' '}
              ao carrinho.
            </p>
          )}
          {reorderResult.skipped.length > 0 && (
            <ul className="mt-1 text-muted-foreground">
              {reorderResult.skipped.map((s) => (
                <li key={`${s.productName}-${s.reason}`}>
                  {s.productName}:{' '}
                  {s.reason === 'UNAVAILABLE' && 'não está mais disponível'}
                  {s.reason === 'OUT_OF_STOCK' && 'está esgotado'}
                  {s.reason === 'PARTIAL' &&
                    `só ${s.added} de ${s.requested} disponíveis no momento`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-4">
          <OrderItemList items={order.items} title={`Itens (${order.items.length})`} />
          <OrderTimeline steps={order.steps} events={order.timeline} />
        </div>

        <aside className="mt-4 flex flex-col gap-4 lg:sticky lg:top-24 lg:mt-0">
          <OrderTotals
            subtotal={order.subtotal}
            shippingTotal={order.shippingTotal}
            discountTotal={order.discountTotal}
            total={order.total}
            couponCode={order.couponCodeSnapshot}
          />

          <OrderDeliveryCard address={order.shippingAddress} method={order.shippingMethod}>
            {order.estimatedDeliveryAt ? (
              <p className="mt-2 text-muted-foreground">
                Previsão de entrega:{' '}
                <span className="font-medium text-foreground">
                  {formatDateLong(order.estimatedDeliveryAt)}
                </span>
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                O prazo de {order.shippingMethod.deliveryDays} dias úteis começa a contar após a
                confirmação do pagamento.
              </p>
            )}

            {/* Só renderiza com dado real: não há coluna de rastreio no banco. */}
            {order.trackingCode && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <Truck className="size-3.5" aria-hidden />
                  Código de rastreio
                </p>
                <p className="mt-1 font-mono text-sm">{order.trackingCode}</p>
                {order.trackingUrl && (
                  <a
                    href={order.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Rastrear encomenda →
                  </a>
                )}
              </div>
            )}
          </OrderDeliveryCard>

          <section className="rounded-lg border border-border bg-card p-5 text-sm">
            <h2 className="mb-2 font-medium">Pagamento</h2>
            {order.payment ? (
              <>
                <p className="text-muted-foreground">
                  {order.payment.method
                    ? PAYMENT_METHOD_LABEL[order.payment.method]
                    : 'Forma não informada'}
                  {' · '}
                  {PAYMENT_STATUS_LABEL[order.payment.status]}
                </p>
                {order.payment.paidAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aprovado em {formatDateTime(order.payment.paidAt)}
                  </p>
                )}
                {order.payment.refundedAmount > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reembolsado: {formatBRL(order.payment.refundedAmount)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                {PAYMENT_STATUS_LABEL[order.paymentStatus]}
              </p>
            )}

            {order.invoiceUrl && (
              <a
                href={order.invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <FileText className="size-3.5" aria-hidden />
                Ver nota fiscal
                {order.invoiceNumber ? ` nº ${order.invoiceNumber}` : ''}
              </a>
            )}
          </section>

          <div className="flex flex-col gap-2">
            {reorderable && (
              <button
                type="button"
                onClick={() => void buyAgain()}
                disabled={reorder.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <RotateCcw className="size-4" aria-hidden />
                {reorder.isPending ? 'Adicionando…' : 'Comprar de novo'}
              </button>
            )}

            <SupportForm orderId={order.id} />

            {order.cancelMode !== 'NONE' && !order.cancelRequestedAt && (
              <CancelOrderDialog orderId={order.id} mode={order.cancelMode} />
            )}
          </div>
        </aside>
      </div>
    </>
  )
}
