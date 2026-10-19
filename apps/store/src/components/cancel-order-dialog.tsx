'use client'

import { useState, type FormEvent } from 'react'
import {
  CUSTOMER_CANCEL_REASONS,
  type CustomerCancelMode,
  type CustomerCancelReason,
} from '@ecommerce/shared/contracts'
import { CANCEL_REASON_LABEL, REFUND_TIMING_LABEL, type PaymentMethod } from '@ecommerce/shared/constants'
import { ApiError } from '@/lib/api'
import { cn, formatBRL } from '@/lib/utils'
import { useCancelOrder } from '@/lib/orders'
import { buttonVariants } from './ui/button'

/**
 * Cancelar um pedido são duas ações diferentes com o mesmo botão, e a cópia
 * precisa dizer qual é qual — o cliente que lê "cancelado" e vê o pedido seguir
 * em separação liga para o suporte achando que houve erro.
 *
 * IMMEDIATE: ninguém começou a separar; acaba na hora, e o pago é estornado
 * automaticamente. REQUEST: a caixa já está sendo montada; a equipe decide.
 *
 * O valor do estorno vem pronto da API (`refundAmount`): a loja só mostra.
 *
 * Sem tela de "pronto" aqui: com sucesso, o pedido devolvido muda de modo e
 * este componente desmonta — a faixa no topo da página é que confirma.
 */

const MIN_OTHER = 5

export const CancelOrderDialog = ({
  orderId,
  mode,
  refundAmount,
  paymentMethod,
}: {
  orderId: string
  mode: Exclude<CustomerCancelMode, 'NONE'>
  refundAmount: number
  paymentMethod: PaymentMethod | null
}) => {
  const [open, setOpen] = useState(false)
  const [reasonCode, setReasonCode] = useState<CustomerCancelReason | null>(null)
  const [detail, setDetail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cancel = useCancelOrder(orderId)

  const immediate = mode === 'IMMEDIATE'
  const needsDetail = reasonCode === 'OTHER'
  const valid = reasonCode !== null && (!needsDetail || detail.trim().length >= MIN_OTHER)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!reasonCode) return
    setError(null)
    try {
      await cancel.mutateAsync({ reasonCode, ...(detail.trim() ? { reason: detail.trim() } : {}) })
      setOpen(false)
      // A confirmação é a faixa no topo; no celular o cliente está lá embaixo.
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir. Tente de novo.')
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(buttonVariants({ variant: 'neutral', emphasis: 'quiet', size: 'sm' }), 'w-full text-muted-foreground')}
      >
        {immediate ? 'Cancelar pedido' : 'Solicitar cancelamento'}
      </button>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <h3 className="text-sm font-medium">{immediate ? 'Cancelar pedido' : 'Solicitar cancelamento'}</h3>

      {immediate ? (
        <p className="mt-1 text-xs text-muted-foreground">
          O cancelamento é imediato e não pode ser desfeito.
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          Seu pedido já está sendo separado, então o cancelamento passa pela nossa equipe, que responde em até 1
          dia útil.
        </p>
      )}

      {refundAmount > 0 && (
        <div className="mt-3 rounded-lg bg-muted p-3 text-xs">
          <p className="font-medium text-foreground">
            {immediate
              ? `Você recebe ${formatBRL(refundAmount)} de volta, automaticamente.`
              : `Se aprovado, você recebe ${formatBRL(refundAmount)} de volta, automaticamente.`}
          </p>
          <p className="mt-1 text-muted-foreground">
            {paymentMethod ? REFUND_TIMING_LABEL[paymentMethod] : 'O valor volta pelo mesmo meio do pagamento.'}
          </p>
        </div>
      )}

      <fieldset className="mt-3">
        <legend className="text-xs font-medium">Por que você quer cancelar?</legend>
        <div className="mt-2 flex flex-col gap-1.5">
          {CUSTOMER_CANCEL_REASONS.map((code) => (
            <label key={code} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="cancel-reason"
                value={code}
                checked={reasonCode === code}
                onChange={() => setReasonCode(code)}
                className="accent-primary"
              />
              {CANCEL_REASON_LABEL[code]}
            </label>
          ))}
        </div>
      </fieldset>

      {reasonCode && (
        <>
          <label htmlFor="cancel-detail" className="mt-3 block text-xs font-medium">
            {needsDetail ? 'Conte o motivo' : 'Quer contar mais? (opcional)'}
          </label>
          <textarea
            id="cancel-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={2}
            maxLength={500}
            required={needsDetail}
            className="mt-1 w-full rounded-lg border border-input bg-card p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={!valid || cancel.isPending}
          className={cn(buttonVariants({ variant: 'danger', size: 'sm' }), 'flex-1')}
        >
          {cancel.isPending ? 'Enviando…' : immediate ? 'Confirmar cancelamento' : 'Enviar solicitação'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className={buttonVariants({ variant: 'neutral', emphasis: 'quiet', size: 'sm' })}
        >
          Voltar
        </button>
      </div>
    </form>
  )
}
