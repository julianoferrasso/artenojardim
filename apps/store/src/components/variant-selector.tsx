'use client'

import type { DerivedOption } from '@/lib/product-options'
import { cn } from '@/lib/utils'

/**
 * Só os botões de opção. Controlado: quem sabe qual variação está escolhida é o
 * painel de compra, porque a galeria também depende dessa informação.
 */
export const VariantSelector = ({
  options,
  value,
  onChange,
}: {
  options: DerivedOption[]
  value: Record<string, string>
  onChange: (selected: Record<string, string>) => void
}) => (
  <>
    {options.map((opt) => (
      <div key={opt.name} className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{opt.name}</span>
        <div className="flex flex-wrap gap-2">
          {opt.values.map((optionValue) => {
            const active = value[opt.name] === optionValue
            return (
              <button
                key={optionValue}
                type="button"
                onClick={() => onChange({ ...value, [opt.name]: optionValue })}
                aria-pressed={active}
                className={cn(
                  'rounded-lg border px-3.5 py-1.5 text-sm transition-all duration-200',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-soft'
                    : 'border-border bg-card hover:border-primary/40 hover:bg-accent',
                )}
              >
                {optionValue}
              </button>
            )
          })}
        </div>
      </div>
    ))}
  </>
)
