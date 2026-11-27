'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { ArrowRight, TriangleAlert } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Confirmação FORTE: mostra o que muda (de → para), o que acontece depois, e só
 * libera o botão com uma palavra digitada. Para alterações que podem tirar a loja
 * do ar — um "OK" por reflexo não pode bastar.
 */

export type ConfirmChange = { label: string; from: string; to: string; mono?: boolean }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  intro?: ReactNode
  changes?: ConfirmChange[]
  consequences: ReactNode[]
  /** O que a pessoa digita para liberar o botão. Maiúsculas/minúsculas não importam. */
  phrase: string
  confirmLabel: string
  /** `danger` = a ação derruba algo na hora. */
  tone?: 'warning' | 'danger'
  pending?: boolean
  error?: string | null
  onConfirm: () => void
}

export const StrongConfirmDialog = ({
  open,
  onOpenChange,
  title,
  intro,
  changes = [],
  consequences,
  phrase,
  confirmLabel,
  tone = 'warning',
  pending = false,
  error,
  onConfirm,
}: Props) => {
  const uid = useId()
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const matches = typed.trim().toLocaleUpperCase('pt-BR') === phrase.toLocaleUpperCase('pt-BR')
  const danger = tone === 'danger'

  return (
    <AlertDialog open={open} onOpenChange={(next: boolean) => !pending && onOpenChange(next)}>
      <AlertDialogContent className="max-h-dvh overflow-y-auto">
        {/* stopPropagation: o diálogo vive num portal, mas o submit sobe pela árvore
            do React — chegaria ao <form> da tela que o abriu. */}
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (matches && !pending) onConfirm()
          }}
          className="grid gap-4"
        >
          <AlertDialogHeader>
            <AlertDialogMedia
              className={cn(danger ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning')}
            >
              <TriangleAlert aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {intro && <AlertDialogDescription>{intro}</AlertDialogDescription>}
          </AlertDialogHeader>

          {changes.length > 0 && (
            <div className="rounded-md border border-border">
              <p className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                O que muda
              </p>
              <dl className="divide-y divide-border text-sm">
                {changes.map((c) => (
                  <div key={c.label} className="grid gap-1 px-3 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
                    <dt className="text-muted-foreground">{c.label}</dt>
                    <dd className={cn('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1', c.mono && 'font-mono text-xs')}>
                      <span className="break-all text-muted-foreground line-through decoration-muted-foreground/50">
                        {c.from}
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="para" />
                      <span className="break-all font-medium">{c.to}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div
            className={cn(
              'rounded-md border p-3 text-sm',
              danger ? 'border-destructive/30 bg-destructive/5' : 'border-warning/40 bg-warning/10',
            )}
          >
            <p className="font-medium">O que acontece</p>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5">
              {consequences.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-phrase`} className="text-sm">
              Para confirmar, digite <strong className="font-mono tracking-wide">{phrase}</strong>
            </label>
            <Input
              id={`${uid}-phrase`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              disabled={pending}
              aria-invalid={typed.length > 0 && !matches}
              className="font-mono"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              Cancelar
            </AlertDialogCancel>
            <Button type="submit" variant={danger ? 'destructive' : 'default'} disabled={!matches || pending}>
              {pending ? 'Salvando…' : confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
