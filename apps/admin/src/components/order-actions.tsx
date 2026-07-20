'use client'

import { useState } from 'react'
import { ChevronDown, Ban, RotateCcw } from 'lucide-react'
import {
  FULFILLMENT_TRANSITIONS,
  canTransitionFulfillment,
  type AdminOrder,
} from '@ecommerce/shared/contracts'
import type { FulfillmentStatus } from '@ecommerce/shared/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useUpdateFulfillment, useCancelOrder, useRefundOrder } from '@/lib/orders'
import { FULFILLMENT_LABEL } from '@/lib/order-labels'
import { formatBRL } from '@/lib/utils'
import { ApiError } from '@/lib/api'

/**
 * Ações do pedido. O menu só oferece o que a matriz de transição permite — a
 * mesma função pura que o backend usa para recusar. Botão desabilitado que o
 * servidor rejeitaria seria pior que ausente: o operador clica, vê erro e não
 * entende por quê.
 *
 * Não existe "marcar como pago": pagamento é escrito só pelo webhook do Stripe.
 */
export const OrderActions = ({ order }: { order: AdminOrder }) => {
  const [cancelOpen, setCancelOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [refundValue, setRefundValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fulfill = useUpdateFulfillment(order.id)
  const cancel = useCancelOrder(order.id)
  const refund = useRefundOrder(order.id)

  const ctx = { paymentStatus: order.paymentStatus, canceled: !!order.canceledAt }
  const allowed = FULFILLMENT_TRANSITIONS[order.fulfillmentStatus].filter((to) =>
    canTransitionFulfillment(order.fulfillmentStatus, to, ctx),
  )

  const run = async (fn: () => Promise<unknown>, onDone?: () => void) => {
    setError(null)
    try {
      await fn()
      onDone?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível concluir a ação.')
    }
  }

  const move = (to: FulfillmentStatus) => void run(() => fulfill.mutateAsync({ fulfillmentStatus: to }))

  const openRefund = () => {
    setRefundValue((order.refundableAmount / 100).toFixed(2))
    setError(null)
    setRefundOpen(true)
  }

  const submitRefund = () => {
    const cents = Math.round(Number(refundValue.replace(',', '.')) * 100)
    if (!Number.isFinite(cents) || cents <= 0) {
      setError('Informe um valor válido.')
      return
    }
    void run(() => refund.mutateAsync({ amount: cents, reason: 'requested_by_customer' }), () =>
      setRefundOpen(false),
    )
  }

  return (
    <div className="flex flex-col gap-2 no-print">
      <div className="flex flex-wrap gap-2">
        {allowed.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={fulfill.isPending}>
                {fulfill.isPending ? 'Alterando…' : 'Alterar status'}
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {allowed.map((to) => (
                <DropdownMenuItem key={to} onSelect={() => move(to)}>
                  {FULFILLMENT_LABEL[to]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {order.canCancel && (
          <Button size="sm" variant="outline" onClick={() => { setReason(''); setError(null); setCancelOpen(true) }}>
            <Ban className="size-4" />
            Cancelar
          </Button>
        )}

        {order.refundableAmount > 0 && (
          <Button size="sm" variant="outline" onClick={openRefund}>
            <RotateCcw className="size-4" />
            Reembolsar
          </Button>
        )}
      </div>

      {/* Quando não há transição possível, dizer por quê evita o chamado. */}
      {allowed.length === 0 && !order.canceledAt && order.paymentStatus !== 'PAID' && (
        <p className="text-xs text-muted-foreground">
          A separação só é liberada depois que o pagamento for confirmado.
        </p>
      )}

      {error && !cancelOpen && !refundOpen && <p className="text-xs text-destructive">{error}</p>}

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar o pedido #{order.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Os itens voltam ao estoque.{' '}
              {order.refundableAmount > 0
                ? 'O dinheiro NÃO é devolvido: use “Reembolsar” depois, se for o caso.'
                : 'Este pedido não tem pagamento a estornar.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cancel-reason">Motivo</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: cliente desistiu da compra"
              rows={3}
              maxLength={500}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={reason.trim().length < 3 || cancel.isPending}
              onClick={(e: React.MouseEvent) => {
                // preventDefault: o AlertDialogAction fecha o diálogo por padrão,
                // e fechar antes da resposta esconderia o erro do servidor.
                e.preventDefault()
                void run(() => cancel.mutateAsync({ reason: reason.trim() }), () => setCancelOpen(false))
              }}
            >
              {cancel.isPending ? 'Cancelando…' : 'Cancelar pedido'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={refundOpen} onOpenChange={setRefundOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reembolsar o pedido #{order.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Disponível para reembolso: {formatBRL(order.refundableAmount)}. O valor é enviado ao
              Stripe agora; o status muda quando o Stripe confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="refund-amount">Valor (R$)</Label>
            <Input
              id="refund-amount"
              inputMode="decimal"
              value={refundValue}
              onChange={(e) => setRefundValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Deixe o valor cheio para reembolso total, ou reduza para um parcial.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={refund.isPending}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault()
                submitRefund()
              }}
            >
              {refund.isPending ? 'Enviando…' : 'Reembolsar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
