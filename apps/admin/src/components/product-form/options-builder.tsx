'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { FieldErrors, OptionDraft } from '@/lib/product-draft'
import { cn } from '@/lib/utils'
import { inputCls } from './section'

const MAX_OPTIONS = 3
const OPTION_SUGGESTIONS = ['Cor', 'Tamanho', 'Aroma', 'Material', 'Modelo']

type Props = {
  options: OptionDraft[]
  onChange: (options: OptionDraft[]) => void
  errors: FieldErrors
}

export const newOption = (): OptionDraft => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()),
  name: '',
  values: [],
})

/**
 * As opções do produto ("Cor: Verde, Azul"). Os valores são chips: Enter ou
 * vírgula confirma, colar "a, b, c" vira três. O grid de variações acompanha
 * cada mudança — não existe botão "gerar" para esquecer de clicar.
 */
export function OptionsBuilder({ options, onChange, errors }: Props) {
  const patch = (id: string, change: Partial<OptionDraft>) =>
    onChange(options.map((o) => (o.id === id ? { ...o, ...change } : o)))
  const used = new Set(options.map((o) => o.name.trim().toLowerCase()))

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-4">
      <div>
        <p className="text-sm font-medium">Opções</p>
        <p className="text-xs text-muted-foreground">
          Ex.: Cor com Verde e Terracota; Tamanho com P e G. Cada combinação vira uma variação.
        </p>
      </div>

      <datalist id="option-name-suggestions">
        {OPTION_SUGGESTIONS.filter((s) => !used.has(s.toLowerCase())).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {options.map((opt, i) => {
        const error = errors[`option:${opt.id}`]
        return (
          <div key={opt.id} className="flex flex-col gap-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <input
                value={opt.name}
                maxLength={60}
                list="option-name-suggestions"
                placeholder={i === 0 ? 'Nome (ex.: Cor)' : 'Nome (ex.: Tamanho)'}
                aria-label={`Nome da opção ${i + 1}`}
                onChange={(e) => patch(opt.id, { name: e.target.value })}
                className={cn(inputCls, 'sm:w-40 sm:shrink-0')}
              />
              <ChipsInput
                values={opt.values}
                onChange={(values) => patch(opt.id, { values })}
                ariaLabel={`Valores de ${opt.name || `opção ${i + 1}`}`}
              />
              {options.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(options.filter((o) => o.id !== opt.id))}
                  aria-label={`Remover a opção ${opt.name || i + 1}`}
                  className="self-end rounded p-2 text-destructive hover:bg-destructive/10 sm:self-auto"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            {error && (
              <p data-invalid="true" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        )
      })}

      {errors.options && (
        <p data-invalid="true" className="text-xs text-destructive">
          {errors.options}
        </p>
      )}

      {options.length < MAX_OPTIONS && (
        <button
          type="button"
          onClick={() => onChange([...options, newOption()])}
          className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <Plus className="size-3.5" />
          Adicionar opção
        </button>
      )}
    </div>
  )
}

/** Valores em chips. Sem repetição (ignorando maiúsculas): "Verde" e "verde" seriam a mesma variação. */
function ChipsInput({
  values,
  onChange,
  ariaLabel,
}: {
  values: string[]
  onChange: (values: string[]) => void
  ariaLabel: string
}) {
  const [text, setText] = useState('')

  const commit = (raw: string) => {
    const incoming = raw
      .split(',')
      .map((v) => v.trim().slice(0, 60))
      .filter(Boolean)
    if (incoming.length === 0) return
    const next = [...values]
    for (const v of incoming) {
      if (!next.some((x) => x.toLowerCase() === v.toLowerCase())) next.push(v)
    }
    onChange(next)
  }

  return (
    <div className="flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 focus-within:ring-2 focus-within:ring-ring">
      {values.map((v) => (
        <span key={v} className="flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-sm text-secondary-foreground">
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            aria-label={`Remover ${v}`}
            className="rounded-sm opacity-60 hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={text}
        aria-label={ariaLabel}
        placeholder={values.length === 0 ? 'Digite um valor e tecle Enter' : 'Mais um…'}
        onChange={(e) => {
          const value = e.target.value
          if (value.includes(',')) {
            commit(value)
            setText('')
          } else {
            setText(value)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(text)
            setText('')
          } else if (e.key === 'Backspace' && text === '' && values.length > 0) {
            onChange(values.slice(0, -1))
          }
        }}
        // Clicar em Salvar sem teclar Enter não pode perder o valor digitado.
        onBlur={() => {
          commit(text)
          setText('')
        }}
        className="h-7 min-w-24 flex-1 bg-transparent text-sm outline-none"
      />
    </div>
  )
}
