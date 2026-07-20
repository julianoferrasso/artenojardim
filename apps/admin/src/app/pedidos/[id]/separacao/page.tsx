'use client'

import { use, useEffect } from 'react'
import { useOrder } from '@/lib/orders'
import { formatZip } from '@/lib/order-labels'
import { formatDate } from '@/lib/utils'

/**
 * Folha de separação (picking list). Deliberadamente SEM preço: quem separa
 * confere SKU, variação e quantidade — valor na folha só atrapalha, e a folha
 * costuma circular pelo depósito.
 *
 * A caixa de conferência é impressa vazia, para marcar à caneta.
 */
export default function PickingListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: order, isLoading } = useOrder(id)

  useEffect(() => {
    if (order) window.print()
  }, [order])

  if (isLoading) return <p className="p-8 text-sm">Carregando…</p>
  if (!order) return <p className="p-8 text-sm">Pedido não encontrado.</p>

  const a = order.shippingAddress
  const totalUnits = order.items.reduce((sum, i) => sum + i.quantity, 0)
  const totalWeight = order.items.reduce((sum, i) => sum + i.weight * i.quantity, 0)

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-black">
      <div className="mb-6 flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <h1 className="text-xl font-bold">Separação · Pedido #{order.number}</h1>
          <p className="text-xs">{formatDate(order.createdAt)}</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-bold">
            {totalUnits} {totalUnits === 1 ? 'peça' : 'peças'}
          </p>
          <p className="text-xs">{(totalWeight / 1000).toFixed(2)} kg</p>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-400 text-left">
            <th className="w-10 py-2">OK</th>
            <th className="py-2">Item</th>
            <th className="py-2">SKU</th>
            <th className="w-14 py-2 text-center">Qtd</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-neutral-200">
              <td className="py-3">
                <span className="block size-5 border-2 border-black" />
              </td>
              <td className="py-3">
                <span className="font-medium">{item.productName}</span>
                <span className="block text-xs">{item.variantName}</span>
              </td>
              <td className="py-3 font-mono text-xs">{item.sku}</td>
              <td className="py-3 text-center text-lg font-bold">{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 border-t border-neutral-300 pt-3 text-sm">
        <h2 className="text-xs font-bold uppercase">Envio</h2>
        <p>
          {a.recipient} · {a.city} - {a.state} · CEP {formatZip(a.zipCode)}
        </p>
        <p className="text-xs">
          {order.shippingMethod.carrier} · {order.shippingMethod.service}
        </p>
      </div>

      {order.customerNote && (
        <div className="mt-4 border-2 border-black p-3 text-sm">
          <strong>Atenção — observação do cliente:</strong>
          <p className="mt-1">{order.customerNote}</p>
        </div>
      )}

      {order.internalNote && (
        <div className="mt-3 border border-neutral-400 p-3 text-sm">
          <strong>Nota interna:</strong>
          <p className="mt-1">{order.internalNote}</p>
        </div>
      )}

      <div className="mt-8 flex gap-8 text-xs">
        <span>Separado por: ______________________</span>
        <span>Conferido por: ______________________</span>
      </div>

      <button
        onClick={() => window.print()}
        className="mt-8 rounded-md border border-neutral-400 px-3 py-1.5 text-sm no-print"
      >
        Imprimir novamente
      </button>
    </div>
  )
}
