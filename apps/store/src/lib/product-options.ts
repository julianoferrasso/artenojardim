import type { Variant } from '@ecommerce/shared/contracts'

/**
 * Derivação das opções a partir das variantes — puro, para a página do produto
 * poder ser testada e para não inflar o componente com lógica de dados.
 */

export type DerivedOption = { name: string; values: string[] }

/**
 * A API injeta esta opção em produto sem variação, porque toda variante precisa
 * de ao menos uma opção. É detalhe interno: não pode chegar à UI.
 */
const IMPLICIT_OPTION = 'Título'
const IMPLICIT_VALUE = 'Default Title'

// As duas condições juntas: uma opção "Título" com valores reais é legítima.
const isImplicit = (o: DerivedOption) =>
  o.name === IMPLICIT_OPTION && o.values.every((v) => v === IMPLICIT_VALUE)

/** Opções e seus valores, na ordem em que aparecem nas variantes. */
export const deriveOptions = (variants: Variant[]): DerivedOption[] => {
  const map = new Map<string, string[]>()
  for (const v of variants) {
    for (const o of v.options) {
      const values = map.get(o.option) ?? []
      if (!values.includes(o.value)) values.push(o.value)
      map.set(o.option, values)
    }
  }
  return [...map.entries()]
    .map(([name, values]) => ({ name, values }))
    .filter((o) => !isImplicit(o))
}

/** A variante que casa exatamente com a seleção. undefined = combinação inexistente. */
export const matchVariant = (
  variants: Variant[],
  selected: Record<string, string>,
): Variant | undefined =>
  variants.find((v) => v.options.every((o) => selected[o.option] === o.value))
