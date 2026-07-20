'use client'

import { use, useEffect } from 'react'
import { useOrder } from '@/lib/orders'
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  formatPhone,
  formatZip,
} from '@/lib/order-labels'
import { formatBRL, formatDate } from '@/lib/utils'

/**
 * Via do pedido para o papel: o documento que vai dentro da caixa. Tudo que o
 * cliente precisa conferir, nada de navegação.
 */
export default function PrintOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: order, isLoading } = useOrder(id)

  // Só abre o diálogo depois que os dados chegaram — imprimir o esqueleto
  // vazio é o erro clássico de tela de impressão.
  useEffect(() => {
    if (order) window.print()
  }, [order])

  if (isLoading) return <p className="p-8 text-sm">Carregando…</p>
  if (!order) return <p className="p-8 text-sm">Pedido não encontrado.</p>

  const a = order.shippingAddress
  const payment = order.payments[0]

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-black">
      <div className="mb-6 flex items-start justify-between border-b border-neutral-300 pb-4">
        <div>
          <h1 className="text-lg font-bold">Arte no Jardim</h1>
          <p className="text-xs">artenojardim.com.br</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">Pedido #{order.number}</p>
          <p className="text-xs">{formatDate(order.createdAt)}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
        <div>
          <h2 className="mb-1 text-xs font-bold uppercase">Cliente</h2>
          <p>{order.customer.name}</p>
          <p>{order.email}</p>
          <p>{formatPhone(order.phone ?? order.customer.phone)}</p>
        </div>
        <div>
          <h2 className="mb-1 text-xs font-bold uppercase">Entrega</h2>
          <p>{a.recipient}</p>
          <p>
            {a.street}, {a.number}
            {a.complement ? ` - ${a.complement}` : ''}
          </p>
          <p>{a.district}</p>
          <p>
            {a.city} - {a.state} · CEP {formatZip(a.zipCode)}
          </p>
        </div>
      </div>

      <table className="mb-4 w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left">
            <th className="py-1.5">Item</th>
            <th className="py-1.5">SKU</th>
            <th className="py-1.5 text-center">Qtd</th>
            <th className="py-1.5 text-right">Unit.</th>
            <th className="py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-neutral-200">
              <td className="py-1.5">
                {item.productName}
                <span className="block text-xs">{item.variantName}</span>
              </td>
              <td className="py-1.5 text-xs">{item.sku}</td>
              <td className="py-1.5 text-center">{item.quantity}</td>
              <td className="py-1.5 text-right">{formatBRL(item.unitPrice)}</td>
              <td className="py-1.5 text-right">{formatBRL(item.totalPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto w-56 text-sm">
        <div className="flex justify-between py-0.5">
          <span>Subtotal</span>
          <span>{formatBRL(order.subtotal)}</span>
        </div>
        {order.discountTotal > 0 && (
          <div className="flex justify-between py-0.5">
            <span>Desconto{order.couponCodeSnapshot ? ` (${order.couponCodeSnapshot})` : ''}</span>
            <span>− {formatBRL(order.discountTotal)}</span>
          </div>
        )}
        <div className="flex justify-between py-0.5">
          <span>Frete ({order.shippingMethod.carrier})</span>
          <span>{formatBRL(order.shippingTotal)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-neutral-400 pt-1 font-bold">
          <span>Total</span>
          <span>{formatBRL(order.total)}</span>
        </div>
      </div>

      {payment && (
        <p className="mt-6 border-t border-neutral-300 pt-3 text-xs">
          Pagamento: {payment.method ? PAYMENT_METHOD_LABEL[payment.method] : '—'} ·{' '}
          {PAYMENT_STATUS_LABEL[payment.status]}
          {payment.paidAt ? ` em ${formatDate(payment.paidAt)}` : ''}
        </p>
      )}

      {order.customerNote && (
        <div className="mt-3 text-xs">
          <strong>Observação do cliente:</strong> {order.customerNote}
        </div>
      )}

      <button
        onClick={() => window.print()}
        className="mt-8 rounded-md border border-neutral-400 px-3 py-1.5 text-sm no-print"
      >
        Imprimir novamente
      </button>
    </div>
  )
}
