import type { CreateVariantInput } from '@ecommerce/shared/contracts'

/**
 * Funções PURAS do catálogo: geram e validam variantes sem tocar no banco.
 * É a parte com regra de verdade — e o que a UI de variações do admin vai reusar
 * para pré-visualizar o cartesiano antes de salvar.
 */

export type OptionSpec = { name: string; values: string[] }

type Combo = Array<{ option: string; value: string }>

/**
 * Produto cartesiano das opções → combinações.
 *
 * ["Cor": Verde,Terracota] × ["Tam": P,G] → 4 combinações. O admin propõe todas,
 * o usuário desmarca as que não existem. Sem opções → uma combinação vazia, que
 * o service materializa como a variante "Default".
 *
 * Ordem estável: segue a ordem das opções e dos valores como vieram, para o
 * preview do admin não embaralhar a cada render.
 */
export const cartesian = (options: OptionSpec[]): Combo[] => {
  if (options.length === 0) return [[]]

  // Loop explícito, sem o generic inline `reduce<Array<Array<...>>>`: o `>>>` de
  // fechamento é tokenizado pelo esbuild como o operador de shift e a expressão
  // vira uma cadeia de comparações que retorna `false`. O alias Combo evita isso.
  let acc: Combo[] = [[]]
  for (const opt of options) {
    acc = acc.flatMap((combo) => opt.values.map((value) => [...combo, { option: opt.name, value }]))
  }
  return acc
}

/**
 * Chave canônica de uma combinação de opções, para detectar duplicatas
 * independentemente da ordem em que as opções foram informadas.
 * {Cor:Verde, Tam:G} e {Tam:G, Cor:Verde} têm a mesma chave.
 */
export const optionKey = (options: Array<{ option: string; value: string }>): string =>
  options
    .map((o) => `${o.option.toLowerCase().trim()}=${o.value.toLowerCase().trim()}`)
    .sort()
    .join('|')

export type VariantValidationError =
  | { code: 'DUPLICATE_SKU'; sku: string }
  | { code: 'DUPLICATE_OPTIONS'; key: string }
  | { code: 'INCONSISTENT_OPTIONS' }

/**
 * Valida o conjunto de variantes de um produto ANTES de gravar:
 *
 * 1. SKU único entre as variantes do mesmo produto (o banco garante único por
 *    loja; aqui pegamos o erro cedo, com mensagem melhor que a violação de FK).
 * 2. Nenhuma combinação de opções repetida — duas variantes "Verde+G" é ambíguo.
 * 3. Todas as variantes usam o MESMO conjunto de nomes de opção: não faz sentido
 *    uma variante ter {Cor} e outra {Cor, Tamanho}. Ou o produto tem opções, e
 *    todas as variantes as preenchem, ou não tem, e todas vêm vazias.
 */
export const validateVariants = (variants: CreateVariantInput[]): VariantValidationError[] => {
  const errors: VariantValidationError[] = []

  const seenSku = new Set<string>()
  for (const v of variants) {
    const sku = v.sku.toLowerCase().trim()
    if (seenSku.has(sku)) errors.push({ code: 'DUPLICATE_SKU', sku: v.sku })
    seenSku.add(sku)
  }

  const seenOptions = new Set<string>()
  for (const v of variants) {
    const key = optionKey(v.options)
    if (seenOptions.has(key)) errors.push({ code: 'DUPLICATE_OPTIONS', key })
    seenOptions.add(key)
  }

  // Conjunto de nomes de opção da primeira variante é a referência.
  const optionNames = (v: CreateVariantInput): string =>
    v.options
      .map((o) => o.option.toLowerCase().trim())
      .sort()
      .join('|')

  const reference = variants[0] ? optionNames(variants[0]) : ''
  if (variants.some((v) => optionNames(v) !== reference)) {
    errors.push({ code: 'INCONSISTENT_OPTIONS' })
  }

  return errors
}

/**
 * Extrai as opções e seus valores DISTINTOS a partir das variantes.
 * É como o service descobre quais ProductOption/ProductOptionValue criar: a
 * fonte da verdade são as variantes, não uma lista de opções separada que
 * poderia divergir delas.
 */
export const deriveOptions = (variants: CreateVariantInput[]): OptionSpec[] => {
  const byOption = new Map<string, string[]>()

  for (const v of variants) {
    for (const { option, value } of v.options) {
      const existing = byOption.get(option) ?? []
      if (!existing.includes(value)) existing.push(value)
      byOption.set(option, existing)
    }
  }

  return [...byOption.entries()].map(([name, values]) => ({ name, values }))
}
