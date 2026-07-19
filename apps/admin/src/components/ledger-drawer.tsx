'use client'

import { useState } from 'react'
import type { StockItem, RecordMovementInput } from '@ecommerce/shared/contracts'
import { useVariantLedger, useRecordMovement } from '@/lib/inventory'
import { formatDate } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

const TYPE_LABEL: Record<string, string> = {
  PURCHASE: 'Entrada',
  RETURN: 'Devolução',
  ADJUSTMENT: 'Ajuste',
  COUNT: 'Contagem',
  SALE: 'Venda',
  CANCELLATION: 'Cancelamento',
}

type FormType = 'PURCHASE' | 'RETURN' | 'ADJUSTMENT' | 'COUNT'

/**
 * Extrato do ledger + formulário de movimento. É a tela que responde "por que o
 * estoque está errado" — a razão inteira de existir o livro-razão.
 *
 * O formulário muda por tipo: COUNT pede a contagem física (o backend calcula a
 * diferença); ADJUSTMENT exige motivo; PURCHASE/RETURN pedem a quantidade.
 */
export const LedgerDrawer = ({ item, onClose }: { item: StockItem; onClose: () => void }) => {
  const { data: ledger, isLoading } = useVariantLedger(item.variantId)
  const record = useRecordMovement()

  const [type, setType] = useState<FormType>('PURCHASE')
  const [quantity, setQuantity] = useState('')
  const [counted, setCounted] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    const input: RecordMovementInput =
      type === 'COUNT'
        ? { variantId: item.variantId, type, counted: Number(counted) }
        : {
            variantId: item.variantId,
            type,
            quantity: Number(quantity),
            ...(reason ? { reason } : {}),
          }

    record.mutate(input, {
      onSuccess: () => {
        setQuantity('')
        setCounted('')
        setReason('')
      },
      onError: (e) => setError(e instanceof ApiError ? e.message : 'Falha ao registrar.'),
    })
  }

  const field = 'h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-semibold">{item.productName}</h2>
            <p className="text-sm text-muted-foreground">
              {item.sku}
              {item.variantLabel !== '—' && ` · ${item.variantLabel}`}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="mb-6 flex gap-4 rounded-lg bg-muted p-4 text-sm">
          <Stat label="Em estoque" value={ledger?.level.onHand ?? item.onHand} />
          <Stat label="Reservado" value={ledger?.level.reserved ?? item.reserved} />
          <Stat label="Disponível" value={ledger?.level.available ?? item.available} highlight />
        </div>

        {/* Formulário de movimento */}
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium">Registrar movimento</p>
          <div className="flex flex-wrap gap-2">
            {(['PURCHASE', 'RETURN', 'ADJUSTMENT', 'COUNT'] as FormType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs',
                  type === t
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-accent',
                )}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          {type === 'COUNT' ? (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                Quantidade contada (o sistema lança a diferença)
              </label>
              <input
                type="number"
                min="0"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                className={field}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                Quantidade {type === 'ADJUSTMENT' ? '(negativa para perda)' : '(positiva)'}
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={field}
              />
            </div>
          )}

          {type === 'ADJUSTMENT' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Motivo (obrigatório)</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            onClick={submit}
            disabled={record.isPending || (type === 'COUNT' ? !counted : !quantity)}
            className="h-9 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {record.isPending ? 'Registrando…' : 'Registrar'}
          </button>
        </div>

        {/* Extrato */}
        <p className="mb-2 text-sm font-medium">Extrato</p>
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {ledger && ledger.movements.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum movimento ainda.</p>
        )}
        {ledger && ledger.movements.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2">Tipo</th>
                <th className="py-2 text-right">Qtd</th>
                <th className="py-2 text-right">Saldo</th>
                <th className="py-2 pl-3">Quando</th>
              </tr>
            </thead>
            <tbody>
              {ledger.movements.map((m) => (
                <tr key={m.id} className="border-b border-border/50">
                  <td className="py-2">
                    {TYPE_LABEL[m.type]}
                    {m.reason && <span className="block text-xs text-muted-foreground">{m.reason}</span>}
                  </td>
                  <td className={cn('py-2 text-right', m.quantity < 0 ? 'text-destructive' : 'text-success')}>
                    {m.quantity > 0 ? '+' : ''}
                    {m.quantity}
                  </td>
                  <td className="py-2 text-right font-medium">{m.runningBalance}</td>
                  <td className="py-2 pl-3 text-xs text-muted-foreground">{formatDate(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-lg font-semibold', highlight && value <= 0 && 'text-warning')}>{value}</p>
    </div>
  )
}
