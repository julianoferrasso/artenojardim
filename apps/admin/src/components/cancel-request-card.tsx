'use client'

import { useState } from 'react'
import { Ban, Check } from 'lucide-react'
import { declineCancelRequestSchema } from '@ecommerce/shared/contracts'
import { ROLE_RANK, type UserRole } from '@ecommerce/shared/constants'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { useApproveCancelRequest, useDeclineCancelRequest } from '@/lib/orders'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { cn, formatBRL, formatDate } from '@/lib/utils'

/** Mesmo piso da rota de aprovação na API: aprovar estorna, e estorno é dinheiro saindo. */
const APPROVE_MIN_ROLE: UserRole = 'ADMIN'

const DECLINE_MAX = 2000

const CANNED_REPLIES = [
  {
    label: 'Pronto para envio',
    text: 'Seu pedido já está pronto para envio e não conseguimos mais cancelá-lo. Assim que receber, você pode pedir a devolução em até 7 dias pelo direito de arrependimento — é só nos escrever aqui.',
  },
  {
    label: 'Já foi enviado',
    text: 'Seu pedido já foi postado e está a caminho, por isso não é mais possível cancelá-lo. Quando receber, se ainda quiser devolver, é só nos escrever aqui em até 7 dias pelo direito de arrependimento.',
  },
  {
    label: 'Resolvido sem cancelar',
    text: 'Conseguimos resolver o que você precisava sem cancelar o pedido, então ele segue normalmente. Se ainda tiver alguma dúvida, é só responder por aqui.',
  },
] as const

type Props = {
  orderId: string
  cancelRequest: { requestedAt: string; reason: string | null }
  refundableAmount: number
  onDone?: () => void
  className?: string
}

/**
 * A decisão sobre o pedido de cancelamento do cliente. Mora na tela do pedido e
 * na da conversa: quem atende decide sem trocar de tela.
 *
 * O valor do estorno vem do servidor (`refundableAmount`); o front só mostra.
 */
export const CancelRequestCard = ({
  orderId,
  cancelRequest,
  refundableAmount,
  onDone,
  className,
}: Props) => {
  const { user } = useAuth()
  const canApprove = !!user && ROLE_RANK[user.role] >= ROLE_RANK[APPROVE_MIN_ROLE]

  const [approveOpen, setApproveOpen] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const approve = useApproveCancelRequest(orderId)
  const decline = useDeclineCancelRequest(orderId)

  const run = async (fn: () => Promise<unknown>, close: () => void) => {
    setError(null)
    try {
      await fn()
      close()
      onDone?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível concluir a ação.')
    }
  }

  const submitDecline = () => {
    const parsed = declineCancelRequestSchema.safeParse({ message })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Mensagem inválida.')
      return
    }
    void run(() => decline.mutateAsync(parsed.data), () => setDeclineOpen(false))
  }

  const approveLabel =
    refundableAmount > 0 ? `Aprovar e estornar ${formatBRL(refundableAmount)}` : 'Aprovar cancelamento'

  return (
    <section
      className={cn('rounded-lg border border-warning/40 bg-warning/10 p-4 no-print', className)}
    >
      <h2 className="text-sm font-semibold">Pedido de cancelamento</h2>
      <p className="mt-1 text-sm">
        O cliente pediu o cancelamento em {formatDate(cancelRequest.requestedAt)}.
      </p>
      {cancelRequest.reason && (
        <blockquote className="mt-2 border-l-2 border-warning pl-3 text-sm whitespace-pre-wrap text-muted-foreground">
          {cancelRequest.reason}
        </blockquote>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!canApprove}
          title={canApprove ? undefined : 'Só administradores aprovam (envolve estorno)'}
          onClick={() => {
            setError(null)
            setApproveOpen(true)
          }}
        >
          <Check className="size-4" />
          {approveLabel}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setMessage('')
            setError(null)
            setDeclineOpen(true)
          }}
        >
          <Ban className="size-4" />
          Recusar
        </Button>
      </div>

      {!canApprove && (
        <p className="mt-2 text-xs text-muted-foreground">
          Só administradores aprovam (envolve estorno). Você pode recusar com uma explicação.
        </p>
      )}

      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar o cancelamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido é cancelado e os itens voltam ao estoque.{' '}
              {refundableAmount > 0
                ? `O estorno de ${formatBRL(refundableAmount)} é pedido ao provedor do pagamento automaticamente — não é preciso usar “Reembolsar”.`
                : 'Este pedido não tem pagamento a estornar.'}{' '}
              O cliente é avisado pela conversa e por e-mail.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={approve.isPending}
              onClick={(e: React.MouseEvent) => {
                // O Radix fecha o diálogo por padrão; sem isto o erro do servidor sumiria junto.
                e.preventDefault()
                void run(() => approve.mutateAsync(), () => setApproveOpen(false))
              }}
            >
              {approve.isPending ? 'Aprovando…' : approveLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recusar o pedido de cancelamento</AlertDialogTitle>
            <AlertDialogDescription>
              O pedido segue o fluxo normal. Explique o motivo: este texto vai para o cliente, pela
              conversa e por e-mail.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">Respostas prontas</span>
            <div className="flex flex-wrap gap-2">
              {CANNED_REPLIES.map((reply) => (
                <Button
                  key={reply.label}
                  type="button"
                  size="xs"
                  variant="secondary"
                  title={reply.text}
                  onClick={() => {
                    setMessage(reply.text)
                    setError(null)
                  }}
                >
                  {reply.label}
                </Button>
              ))}
            </div>

            <Label htmlFor="decline-message" className="mt-2">
              Mensagem ao cliente
            </Label>
            <Textarea
              id="decline-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={DECLINE_MAX}
              placeholder="Explique por que o pedido não pode mais ser cancelado"
            />
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={error ? 'text-destructive' : 'text-muted-foreground'}>
                {error ?? 'Mínimo de 10 caracteres.'}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {message.length}/{DECLINE_MAX}
              </span>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={message.trim().length < 10 || decline.isPending}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault()
                submitDecline()
              }}
            >
              {decline.isPending ? 'Enviando…' : 'Recusar e enviar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
