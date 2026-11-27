'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Peças dos formulários que abrem dentro do card (banners, categorias, cupons):
 * grupos com título pequeno, a faixa de cima com o que decide "onde/quando",
 * o rodapé fixo com Salvar. Só apresentação — cada form tem a sua lógica.
 */

export const groupTitleClass = 'text-xs font-medium uppercase tracking-wider text-muted-foreground'

/** <select> nativo com a mesma cara do Input do shadcn (o RHF registra direto). */
export const selectClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50'

export const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-4">
    <h3 className={groupTitleClass}>{title}</h3>
    {children}
  </section>
)

/** Aviso que não impede salvar — só explica o que a loja vai fazer. */
export const Notice = ({ children }: { children: ReactNode }) => (
  <p className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">{children}</p>
)

export const Counter = ({ value, max }: { value: string | null | undefined; max: number }) => {
  const length = value?.length ?? 0
  return (
    <span className={cn('text-xs tabular-nums text-muted-foreground', length > max && 'text-destructive')}>
      {length}/{max}
    </span>
  )
}

/** Controle segmentado: escolha única entre 2–3 opções curtas, tudo à vista. */
export const Segmented = <T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) => (
  <div role="radiogroup" aria-label={ariaLabel} className="inline-flex w-fit rounded-md border border-input bg-muted p-0.5">
    {options.map((option) => {
      const checked = option.value === value
      return (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={checked}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded px-3 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            checked ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      )
    })}
  </div>
)

/** A faixa de cima do form: o que decide onde/quando o item aparece, sem rolar. */
export const FormTopBar = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-dashed border-border px-5 py-3">
    {children}
  </div>
)

/**
 * Fixo no pé do card enquanto o form rola: salvar nunca exige descer até o fim.
 * Só os botões — no celular, mais que isso cobriria o form.
 */
export const FormFooter = ({
  error,
  dirty,
  saveLabel,
  busy,
  onCancel,
}: {
  error: string | null
  dirty: boolean
  saveLabel: string
  busy: boolean
  onCancel: () => void
}) => (
  <footer className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-b-lg border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
    {error ? (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    ) : (
      dirty && (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-hidden className="size-2 rounded-full bg-primary" />
          Alterações não salvas
        </span>
      )
    )}
    <div className="ml-auto flex items-center gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={busy}>
        {saveLabel}
      </Button>
    </div>
  </footer>
)
