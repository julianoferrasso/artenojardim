'use client'

import { useState, type FormEvent } from 'react'
import type { SupportTopic } from '@ecommerce/shared/contracts'
import { SUPPORT_TOPICS } from '@ecommerce/shared/contracts'
import { SUPPORT_TOPIC_LABEL } from '@ecommerce/shared/constants'
import { ApiError } from '@/lib/api'
import { useSendSupport } from '@/lib/orders'

/**
 * Fala com o suporte a partir do pedido. A mensagem entra na timeline do pedido
 * no admin — que é onde a equipe já olha quando a pergunta é "o que houve com o
 * 1042?". Sem isso, um e-mail solto obrigaria alguém a cruzar remetente com
 * pedido na mão.
 */
export const SupportForm = ({ orderId }: { orderId: string }) => {
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState<SupportTopic>('OTHER')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const send = useSendSupport(orderId)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await send.mutateAsync({ topic, message: message.trim() })
      setSent(true)
      setMessage('')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
        setError('Você enviou muitas mensagens sobre este pedido. Tente novamente mais tarde.')
        return
      }
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar. Tente de novo.')
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg bg-success/10 p-3 text-sm text-success">
        Recebemos sua mensagem. Respondemos em até 1 dia útil.
        <button
          type="button"
          onClick={() => {
            setSent(false)
            setOpen(true)
          }}
          className="mt-1 block text-xs underline"
        >
          Enviar outra mensagem
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent"
      >
        Falar com o suporte
      </button>
    )
  }

  const tooShort = message.trim().length < 10

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <h3 className="text-sm font-medium">Falar sobre este pedido</h3>

      <label htmlFor="support-topic" className="mt-3 block text-xs font-medium">
        Assunto
      </label>
      <select
        id="support-topic"
        value={topic}
        onChange={(e) => setTopic(e.target.value as SupportTopic)}
        className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {SUPPORT_TOPICS.map((t) => (
          <option key={t} value={t}>
            {SUPPORT_TOPIC_LABEL[t]}
          </option>
        ))}
      </select>

      <label htmlFor="support-message" className="mt-3 block text-xs font-medium">
        Mensagem
      </label>
      <textarea
        id="support-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        maxLength={1000}
        required
        placeholder="Conte o que aconteceu"
        className="mt-1 w-full rounded-lg border border-input bg-card p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p className="mt-1 text-right text-xs text-muted-foreground">{message.length}/1000</p>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={tooShort || send.isPending}
          className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition-all duration-200 hover:bg-primary/90 disabled:opacity-50"
        >
          {send.isPending ? 'Enviando…' : 'Enviar mensagem'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
