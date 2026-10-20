'use client'

import { useState } from 'react'
import { BellPlus, KeyRound, MoreHorizontal, Send, Trash2 } from 'lucide-react'
import type { AlertDestination } from '@ecommerce/shared/contracts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  DESTINATION_STATUS_CLASS,
  DESTINATION_STATUS_LABEL,
  alertErrorMessage,
  destinationAddress,
  destinationStatus,
  useDeleteAlertDestination,
  useTestAlertDestination,
  useUpdateAlertDestination,
} from '@/lib/alerts'
import { cn, formatDate, formatRelative } from '@/lib/utils'
import { ChannelIcon } from './channel-icon'

type Feedback = { ok: boolean; text: string }

const eventsCount = (n: number): string => (n === 0 ? 'nenhum evento' : n === 1 ? '1 evento' : `${n} eventos`)

const detailLine = (d: AlertDestination): string => {
  if (d.pendingStep === 'telegram_link') return 'Falta abrir o link no Telegram e tocar em Iniciar.'
  if (d.pendingStep === 'code') return 'Falta digitar o código enviado para confirmar.'
  const sent = d.lastSentAt ? `último envio ${formatRelative(d.lastSentAt)}` : 'nenhum envio ainda'
  return `${eventsCount(d.events.length)} · ${sent}`
}

export const DestinationList = ({
  destinations,
  onResume,
  onAdd,
}: {
  destinations: AlertDestination[]
  onResume: (destination: AlertDestination) => void
  onAdd: () => void
}) => {
  const update = useUpdateAlertDestination()
  const test = useTestAlertDestination()
  const remove = useDeleteAlertDestination()
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({})
  const [deleting, setDeleting] = useState<AlertDestination | null>(null)

  const setRowFeedback = (id: string, value: Feedback | null) =>
    setFeedback(({ [id]: _old, ...rest }) => (value ? { ...rest, [id]: value } : rest))

  const runTest = (d: AlertDestination) => {
    setRowFeedback(d.id, null)
    test.mutate(d.id, {
      onSuccess: ({ sentTo }) =>
        setRowFeedback(d.id, { ok: true, text: `Teste enviado para ${sentTo}. Confira se chegou.` }),
      onError: (err) => setRowFeedback(d.id, { ok: false, text: alertErrorMessage(err) }),
    })
  }

  if (destinations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhum destino ainda. Cadastre um e-mail, um chat do Telegram ou um WhatsApp para receber os alertas da
          loja.
        </p>
        <Button onClick={onAdd}>
          <BellPlus />
          Adicionar destino
        </Button>
      </div>
    )
  }

  return (
    <>
      {update.isError && (
        <p role="alert" className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {alertErrorMessage(update.error, 'Não foi possível salvar a mudança.')}
        </p>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {destinations.map((d) => {
          const status = destinationStatus(d)
          const rowFeedback = feedback[d.id]
          return (
            <li key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                  <ChannelIcon channel={d.channel} className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{d.label}</p>
                    <Badge variant="outline" className={DESTINATION_STATUS_CLASS[status]}>
                      {d.pendingStep === 'telegram_link' ? 'Aguardando o Telegram' : DESTINATION_STATUS_LABEL[status]}
                    </Badge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{destinationAddress(d)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{detailLine(d)}</p>
                  {d.lastError && (
                    <p className="mt-1 text-xs text-destructive" title={d.lastErrorAt ? formatDate(d.lastErrorAt) : undefined}>
                      {d.lastError}
                    </p>
                  )}
                  {rowFeedback && (
                    <p role="status" className={cn('mt-1 text-xs', rowFeedback.ok ? 'text-success' : 'text-destructive')}>
                      {rowFeedback.text}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                {d.verified ? (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={d.enabled}
                      onCheckedChange={(enabled: boolean) => update.mutate({ id: d.id, input: { enabled } })}
                      aria-label={d.enabled ? `Pausar ${d.label}` : `Ativar ${d.label}`}
                    />
                    {d.enabled ? 'Ativo' : 'Pausado'}
                  </label>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => onResume(d)}>
                    Continuar verificação
                  </Button>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={`Ações de ${d.label}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={!d.verified || test.isPending} onSelect={() => runTest(d)}>
                      <Send />
                      Enviar teste
                    </DropdownMenuItem>
                    {!d.verified && (
                      <DropdownMenuItem onSelect={() => onResume(d)}>
                        <KeyRound />
                        Continuar verificação
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(d)}>
                      <Trash2 />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          )
        })}
      </ul>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setDeleting(null)
            remove.reset()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{deleting?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Este destino para de receber alertas. Para voltar, ele precisa ser cadastrado e confirmado com um código
              de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.isError && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {alertErrorMessage(remove.error)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                // Fica aberto até a API responder: um erro precisa aparecer aqui.
                e.preventDefault()
                if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
              }}
            >
              {remove.isPending ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
