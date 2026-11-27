'use client'

import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useDialogs } from '@/components/confirm-dialog'
import { cn } from '@/lib/utils'

/**
 * Lista em que o formulário abre DENTRO do card do item (banners, categorias,
 * cupons). Um contêiner só, com uma borda só, envolve o resumo e o form — é o
 * que diz "este formulário é deste item". Só apresentação: quem decide o que
 * está aberto é a página.
 */

/** Recuo da árvore (categorias). Estilo inline: a profundidade não tem teto. */
const indentStyle = (indent?: number): CSSProperties | undefined => (indent ? { marginLeft: indent } : undefined)

type ItemProps = {
  open: boolean
  /** Como o item é lido no aria-label: `o banner "Verão"`. */
  label: string
  /** Miniatura + título + linha de detalhes. Fica dentro do botão que abre/fecha. */
  summary: ReactNode
  onToggle: () => void
  /** Ações extras entre Editar e Excluir (ex.: "+ Subcategoria"). */
  actions?: ReactNode
  onDelete?: () => void
  deleting?: boolean
  indent?: number
  /** O formulário; só é montado com o item aberto. */
  children?: ReactNode
}

export const InlineEditItem = ({
  open,
  label,
  summary,
  onToggle,
  actions,
  onDelete,
  deleting = false,
  indent,
  children,
}: ItemProps) => {
  const header = (
    <div className={cn('relative flex items-center gap-3 px-3 py-2', open && 'rounded-t-lg bg-accent/40')}>
      {/* O ::after deste botão cobre o cabeçalho inteiro (não o form), e as ações
          ficam por cima dele (relative + z-10). */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${open ? 'Fechar' : 'Editar'} ${label}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
      >
        {summary}
      </button>

      <span className="relative z-10 flex shrink-0 flex-wrap justify-end gap-1">
        <Button type="button" size="xs" variant="outline" onClick={onToggle}>
          {open ? 'Fechar' : 'Editar'}
        </Button>
        {actions}
        {onDelete && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={onDelete}
            disabled={deleting}
            className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            Excluir
          </Button>
        )}
      </span>
    </div>
  )

  return open ? (
    <OpenShell indent={indent}>
      {header}
      <div className="border-t border-border">{children}</div>
    </OpenShell>
  ) : (
    <li
      style={indentStyle(indent)}
      className="rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
    >
      {header}
    </li>
  )
}

/** O contêiner aberto de um item que ainda não existe ("Novo banner", "Nova categoria"). */
export const NewItemShell = ({
  title,
  hint,
  onClose,
  indent,
  children,
}: {
  title: string
  hint: string
  onClose: () => void
  indent?: number
  children: ReactNode
}) => (
  <OpenShell indent={indent}>
    <div className="flex items-center gap-3 rounded-t-lg bg-accent/40 px-3 py-2">
      <Thumb url={null} label="novo" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Button type="button" size="xs" variant="outline" onClick={onClose}>
        Fechar
      </Button>
    </div>
    <div className="border-t border-border">{children}</div>
  </OpenShell>
)

/**
 * Ao abrir, traz o card para a tela: fechar um card de cima desloca a página, e
 * o form aberto podia nascer fora da vista.
 */
const OpenShell = ({ indent, children }: { indent?: number; children: ReactNode }) => {
  const ref = useRef<HTMLLIElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const { top } = el.getBoundingClientRect()
    if (top < 0 || top > window.innerHeight * 0.5) {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }, [])

  return (
    <li
      ref={ref}
      style={indentStyle(indent)}
      className="scroll-mt-4 rounded-lg border border-primary/50 bg-card shadow-sm ring-1 ring-primary/15"
    >
      {children}
    </li>
  )
}

/** Miniatura do resumo. Sem foto, um quadro com o rótulo. */
export const Thumb = ({ url, label, className }: { url: string | null; label: string; className?: string }) =>
  url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cn('h-12 w-20 shrink-0 rounded object-cover', className)} />
  ) : (
    <span
      className={cn(
        'flex h-12 w-20 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground',
        className,
      )}
    >
      {label}
    </span>
  )

/**
 * Protege a edição aberta: trocar de item, fechar ou sair da página com
 * alteração não salva pergunta antes. O form avisa por `onDirtyChange`; é ref
 * e não estado porque só é lido na hora de fechar.
 */
export const useDirtyGuard = (message = 'Descartar as alterações não salvas?') => {
  const dirtyRef = useRef(false)

  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty
  }, [])

  const { confirm } = useDialogs()

  /** Roda `action` se não há o que perder — ou se a pessoa confirmar o descarte. */
  const guard = useCallback(
    (action: () => void) => {
      const run = () => {
        dirtyRef.current = false
        action()
      }
      if (!dirtyRef.current) return run()
      void confirm({
        title: message,
        description: 'O que você mudou neste formulário e ainda não salvou será perdido.',
        confirmLabel: 'Descartar',
        cancelLabel: 'Continuar editando',
        tone: 'danger',
      }).then((ok) => ok && run())
    },
    [message, confirm],
  )

  /** Depois de salvar ou excluir: não há mais o que perder. */
  const reset = useCallback(() => {
    dirtyRef.current = false
  }, [])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  return { onDirtyChange, guard, reset }
}
