'use client'

import { useState, useMemo } from 'react'
import { cartesian, type CreateVariantInput, type OptionSpec } from '@ecommerce/shared/contracts'
import { cn } from '@/lib/utils'

/**
 * Editor de variações — a tela mais complexa do admin, onde o lojista passa a
 * maior parte do tempo.
 *
 * Dois modos:
 *  - sem opções: uma variante única (preço, SKU, peso).
 *  - com opções: declara "Cor: Verde, Terracota" e "Tam: P, G"; o cartesiano
 *    (o MESMO do backend, via shared) gera o grid; o usuário preenche cada linha.
 *
 * O componente é controlado: emite o array de CreateVariantInput para o form pai.
 */

type Props = {
  value: CreateVariantInput[]
  onChange: (variants: CreateVariantInput[]) => void
}

type OptionDraft = { name: string; valuesText: string }

const emptyVariant = (options: CreateVariantInput['options'] = []): CreateVariantInput => ({
  sku: '',
  price: 0,
  weight: 0,
  length: 0,
  width: 0,
  height: 0,
  position: 0,
  isActive: true,
  options,
})

export const VariantEditor = ({ value, onChange }: Props) => {
  const [hasOptions, setHasOptions] = useState(() => value.some((v) => v.options.length > 0))
  const [options, setOptions] = useState<OptionDraft[]>([{ name: '', valuesText: '' }])

  // Specs a partir dos rascunhos: "Verde, Terracota" -> ['Verde','Terracota'].
  const specs: OptionSpec[] = useMemo(
    () =>
      options
        .map((o) => ({
          name: o.name.trim(),
          values: o.valuesText
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        }))
        .filter((o) => o.name && o.values.length > 0),
    [options],
  )

  /** Gera/atualiza o grid de variantes a partir das opções, preservando o que já
   *  foi digitado nas linhas que continuam existindo (casadas pela combinação). */
  const regenerate = () => {
    const combos = cartesian(specs)
    const byKey = new Map(value.map((v) => [keyOf(v.options), v]))
    const next = combos.map((combo) => {
      const existing = byKey.get(keyOf(combo))
      return existing ? { ...existing, options: combo } : emptyVariant(combo)
    })
    onChange(next)
  }

  const toggleMode = (on: boolean) => {
    setHasOptions(on)
    onChange(on ? [] : [emptyVariant()])
  }

  const patchVariant = (index: number, patch: Partial<CreateVariantInput>) => {
    onChange(value.map((v, i) => (i === index ? { ...v, ...patch } : v)))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={!hasOptions}
            onChange={() => toggleMode(false)}
            className="size-4"
          />
          Produto simples
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={hasOptions}
            onChange={() => toggleMode(true)}
            className="size-4"
          />
          Com variações
        </label>
      </div>

      {hasOptions && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium">Opções</p>
          {options.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <input
                placeholder="Nome (ex.: Cor)"
                value={opt.name}
                onChange={(e) =>
                  setOptions(options.map((o, j) => (j === i ? { ...o, name: e.target.value } : o)))
                }
                className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm"
              />
              <input
                placeholder="Valores separados por vírgula (Verde, Terracota)"
                value={opt.valuesText}
                onChange={(e) =>
                  setOptions(
                    options.map((o, j) => (j === i ? { ...o, valuesText: e.target.value } : o)),
                  )
                }
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              />
              {options.length > 1 && (
                <button
                  type="button"
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  className="px-2 text-sm text-destructive"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOptions([...options, { name: '', valuesText: '' }])}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              + Opção
            </button>
            <button
              type="button"
              onClick={regenerate}
              disabled={specs.length === 0}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Gerar variações ({cartesian(specs).length})
            </button>
          </div>
        </div>
      )}

      {value.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                {hasOptions && <th className="py-2 pr-3">Variação</th>}
                <th className="py-2 pr-3">SKU</th>
                <th className="py-2 pr-3">Preço (R$)</th>
                <th className="py-2 pr-3">Peso (g)</th>
                <th className="py-2 pr-3">Ativa</th>
              </tr>
            </thead>
            <tbody>
              {value.map((v, i) => (
                <tr key={i} className="border-b border-border/50">
                  {hasOptions && (
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {v.options.map((o) => o.value).join(' / ')}
                    </td>
                  )}
                  <td className="py-2 pr-3">
                    <input
                      value={v.sku}
                      onChange={(e) => patchVariant(i, { sku: e.target.value })}
                      className="h-8 w-28 rounded border border-input bg-background px-2"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    {/* Preço em reais na UI, centavos no contrato: converte na borda. */}
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={v.price ? v.price / 100 : ''}
                      onChange={(e) =>
                        patchVariant(i, { price: Math.round(Number(e.target.value) * 100) })
                      }
                      className="h-8 w-24 rounded border border-input bg-background px-2"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      min="0"
                      value={v.weight || ''}
                      onChange={(e) => patchVariant(i, { weight: Number(e.target.value) })}
                      className={cn(
                        'h-8 w-20 rounded border border-input bg-background px-2',
                        v.isActive && !v.weight && 'border-warning',
                      )}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={v.isActive}
                      onChange={(e) => patchVariant(i, { isActive: e.target.checked })}
                      className="size-4"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Chave local para casar linhas ao regenerar (não importa a canônica do shared:
// aqui a ordem é sempre a do cartesiano, então concatenar basta).
const keyOf = (options: CreateVariantInput['options']): string =>
  options.map((o) => `${o.option}=${o.value}`).join('|')
