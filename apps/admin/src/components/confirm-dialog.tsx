'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Info, TriangleAlert } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

/**
 * Substituto do confirm()/alert() nativos. Um provider no topo e um diálogo só:
 * a tela pede `await confirm({...})` e segue no mesmo fluxo de antes, sem
 * estado de "aberto" espalhado por cada página.
 *
 * Para o que pode tirar a loja do ar, use o StrongConfirmDialog (palavra digitada).
 */

export type ConfirmOptions = {
  title: string
  description?: ReactNode
  /** Padrão: "Confirmar". */
  confirmLabel?: string
  /** Padrão: "Cancelar". */
  cancelLabel?: string
  /** `danger` = botão vermelho; para excluir e para o que não tem volta. */
  tone?: 'default' | 'danger'
}

export type NoticeOptions = {
  title: string
  description?: ReactNode
  /** Padrão: "Entendi". */
  okLabel?: string
}

type Dialogs = {
  /** Resolve `true` só no botão de confirmar; Esc, fora e Cancelar = `false`. */
  confirm: (options: ConfirmOptions) => Promise<boolean>
  /** Aviso com um botão só. Resolve quando fecha. */
  notify: (options: NoticeOptions) => Promise<void>
}

type Shown =
  | { kind: 'confirm'; options: ConfirmOptions }
  | { kind: 'notice'; options: NoticeOptions }

const DialogsContext = createContext<Dialogs | null>(null)

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false)
  // Não zera ao fechar: o conteúdo sumiria no meio da animação de saída.
  const [shown, setShown] = useState<Shown | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setOpen(false)
  }, [])

  const show = useCallback((next: Shown) => {
    // Um segundo pedido com o primeiro ainda aberto: o primeiro vale como cancelado.
    resolver.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setShown(next)
      setOpen(true)
    })
  }, [])

  const confirm = useCallback(
    (options: ConfirmOptions) => show({ kind: 'confirm', options }),
    [show],
  )
  const notify = useCallback(
    async (options: NoticeOptions) => {
      await show({ kind: 'notice', options })
    },
    [show],
  )

  const danger = shown?.kind === 'confirm' && shown.options.tone === 'danger'

  return (
    <DialogsContext.Provider value={{ confirm, notify }}>
      {children}
      <AlertDialog open={open} onOpenChange={(next: boolean) => !next && settle(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia
              className={cn(danger ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')}
            >
              {danger ? <TriangleAlert aria-hidden="true" /> : <Info aria-hidden="true" />}
            </AlertDialogMedia>
            <AlertDialogTitle>{shown?.options.title}</AlertDialogTitle>
            {shown?.options.description && (
              <AlertDialogDescription asChild>
                <div className="flex flex-col gap-2">{shown.options.description}</div>
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            {shown?.kind === 'confirm' ? (
              <>
                <AlertDialogCancel>{shown.options.cancelLabel ?? 'Cancelar'}</AlertDialogCancel>
                <AlertDialogAction
                  variant={danger ? 'destructive' : 'default'}
                  onClick={() => settle(true)}
                >
                  {shown.options.confirmLabel ?? 'Confirmar'}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={() => settle(true)}>
                {shown?.options.okLabel ?? 'Entendi'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogsContext.Provider>
  )
}

export const useDialogs = (): Dialogs => {
  const ctx = useContext(DialogsContext)
  if (!ctx) throw new Error('useDialogs precisa do <ConfirmProvider> (components/providers.tsx).')
  return ctx
}
