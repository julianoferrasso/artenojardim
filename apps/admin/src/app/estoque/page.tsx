'use client'

import { useState } from 'react'
import type { StockItem } from '@ecommerce/shared/contracts'
import { useStock } from '@/lib/inventory'
import { LedgerDrawer } from '@/components/ledger-drawer'
import { cn } from '@/lib/utils'

export default function StockPage() {
  const [lowStock, setLowStock] = useState(false)
  const { data, isLoading, error } = useStock(lowStock)
  const [selected, setSelected] = useState<StockItem | null>(null)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Estoque</h1>

      <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={lowStock}
            onChange={(e) => setLowStock(e.target.checked)}
            className="size-4"
          />
          Só estoque baixo (disponível ≤ 0)
        </label>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {error && <p className="text-sm text-destructive">Falha ao carregar estoque.</p>}
        {data && data.data.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {lowStock ? 'Nenhuma variação com estoque baixo.' : 'Nenhuma variação ainda.'}
          </p>
        )}

        {data && data.data.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-3">Produto</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3 text-right">Em estoque</th>
                  <th className="p-3 text-right">Reservado</th>
                  <th className="p-3 text-right">Disponível</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((item) => (
                  <tr key={item.variantId} className="border-b border-border/50 last:border-0">
                    <td className="p-3">
                      <span>{item.productName}</span>
                      {item.variantLabel !== '—' && (
                        <span className="ml-1 text-xs text-muted-foreground">{item.variantLabel}</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{item.sku}</td>
                    <td className="p-3 text-right">{item.onHand}</td>
                    <td className="p-3 text-right text-muted-foreground">{item.reserved}</td>
                    <td className={cn('p-3 text-right font-medium', item.available <= 0 && 'text-warning')}>
                      {item.available}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setSelected(item)}
                        className="rounded-md border border-border px-3 py-1 text-xs hover:bg-accent"
                      >
                        Extrato / ajustar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {selected && <LedgerDrawer item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
