'use client'

import { useState, type FormEvent } from 'react'
import type { CustomerCancelMode } from '@ecommerce/shared/contracts'
import { ApiError } from '@/lib/api'
import { useCancelOrder } from '@/lib/orders'

/**
 * Cancelar um pedido são duas ações diferentes com o mesmo botão, e a cópia
 * precisa dizer qual é qual — o cliente que lê "cancelado" e vê o pedido seguir
 * em separação liga para o suporte achando que houve erro.
 *
 * IMMEDIATE: nada foi pago e nada foi separado; acaba na hora.
 * REQUEST: há dinheiro ou trabalho envolvido; a equipe decide.
 */

const COPY = {
  IMMEDIATE: {
    trigger: 'Cancelar pedido',
    title: 'Cancelar pedido',
    body: 'O cancelamento é imediato e os itens voltam para o estoque. Esta ação não pode ser desfeita.',
    submit: 'Confirmar cancelamento',
    done: 'Pedido cancelado.',
  },
  REQUEST: {
    trigger: 'Solicitar cancelamento',
    title: 'Solicitar cancelamento',
    body: 'Sua solicitação vai para a nossa equipe, que responde em até 1 dia útil. Se o pedido já foi pago, o estorno é avaliado junto com o cancelamento.',
    submit: 'Enviar solicitação',
    done: 'Solicitação enviada. Nossa equipe vai analisar.',
  },
} as const

export const CancelOrderDialog = ({
  orderId,
  mode,
}: {
  orderId: string
  mode: Exclude<CustomerCancelMode, 'NONE'>
}) => {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cancel = useCancelOrder(orderId)
  const copy = COPY[mode]

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await cancel.mutateAsync({ reason: reason.trim() })
      setOpen(false)
      setReason('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir. Tente de novo.')
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {copy.trigger}
      </button>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <h3 className="text-sm font-medium">{copy.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{copy.body}</p>

      <label htmlFor="cancel-reason" className="mt-3 block text-xs font-medium">
        Motivo
      </label>
      <textarea
        id="cancel-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        minLength={5}
        maxLength={500}
        required
        placeholder="Ex.: comprei o tamanho errado"
        className="mt-1 w-full rounded-lg border border-input bg-card p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={reason.trim().length < 5 || cancel.isPending}
          className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-soft transition-all duration-200 hover:bg-destructive/90 disabled:opacity-50"
        >
          {cancel.isPending ? 'Enviando…' : copy.submit}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
        >
          Voltar
        </button>
      </div>
    </form>
  )
}
