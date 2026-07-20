'use client'

import { useState } from 'react'
import type { AdminOrder } from '@ecommerce/shared/contracts'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAddOrderEvent } from '@/lib/orders'
import { formatDate } from '@/lib/utils'
import { ApiError } from '@/lib/api'

/**
 * Histórico do pedido, do mais recente para o mais antigo — a pergunta do
 * suporte é sempre "o que aconteceu por último?".
 */
export const OrderTimeline = ({ order }: { order: AdminOrder }) => {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useAddOrderEvent(order.id)

  const submit = async () => {
    const description = text.trim()
    if (!description) return
    setError(null)
    try {
      await add.mutateAsync({ description })
      setText('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Falha ao registrar a observação.')
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Histórico</h2>

      <ol className="mt-4 flex flex-col gap-4">
        {order.events.map((event) => (
          <li key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className="size-2 shrink-0 rounded-full bg-primary" />
              <span className="mt-1 w-px flex-1 bg-border" />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-sm">{event.description}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(event.createdAt)}
                {event.userName ? ` · ${event.userName}` : ' · sistema'}
              </p>
            </div>
          </li>
        ))}
        {order.events.length === 0 && (
          <li className="text-sm text-muted-foreground">Nenhum evento registrado.</li>
        )}
      </ol>

      <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4 no-print">
        <label htmlFor="order-event" className="text-xs font-medium text-muted-foreground">
          Registrar observação no histórico
        </label>
        <Textarea
          id="order-event"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex.: cliente pediu para entregar após as 14h"
          rows={2}
          maxLength={500}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          type="button"
          size="sm"
          className="self-end"
          disabled={!text.trim() || add.isPending}
          onClick={() => void submit()}
        >
          {add.isPending ? 'Registrando…' : 'Registrar'}
        </Button>
      </div>
    </section>
  )
}
