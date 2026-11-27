import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Peças visuais do formulário de produto — o mesmo card e o mesmo campo em todas as seções. */

export const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive'

export const textareaCls =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive'

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-medium">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * Rótulo + campo + dica/erro. É um <div>, não <label>: o editor rico e os chips
 * não podem ficar dentro de um <label> (o clique no texto vira clique no primeiro
 * botão). Para inputs simples, passe `htmlFor`.
 */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  counter,
  className,
  children,
}: {
  label: ReactNode
  htmlFor?: string
  required?: boolean
  hint?: ReactNode
  error?: string | undefined
  counter?: { value: number; recommended: number }
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
          {required && (
            <span aria-hidden className="text-destructive">
              {' '}
              *
            </span>
          )}
        </label>
        {counter && (
          <span
            className={cn(
              'text-xs tabular-nums',
              counter.value > counter.recommended ? 'text-warning-foreground' : 'text-muted-foreground',
            )}
          >
            {counter.value}/{counter.recommended}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <p data-invalid="true" className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
