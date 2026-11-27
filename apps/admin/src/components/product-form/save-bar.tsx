import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Barra fixa no rodapé: o "Salvar" fica sempre à mão, em vez de um botão por
 * seção (o desenho antigo, em que "Publicar" ignorava o que não tinha sido salvo).
 */
export function SaveBar({
  message,
  tone = 'muted',
  children,
}: {
  message: ReactNode
  tone?: 'muted' | 'warning' | 'error' | 'success'
  children: ReactNode
}) {
  return (
    <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div
        role="status"
        className={cn(
          'min-w-0 text-sm',
          tone === 'muted' && 'text-muted-foreground',
          tone === 'warning' && 'font-medium text-warning-foreground',
          tone === 'error' && 'text-destructive',
          tone === 'success' && 'text-success',
        )}
      >
        {message}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{children}</div>
    </div>
  )
}

export const primaryBtn =
  'h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50'
export const secondaryBtn =
  'h-10 rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent disabled:opacity-50'
