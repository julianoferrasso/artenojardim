import type { CreateVariantInput, OptionSpec } from '@ecommerce/shared/contracts'
import { optionKey } from '@ecommerce/shared/contracts'

/**
 * Validações PURAS do catálogo, específicas do backend.
 *
 * `cartesian` e `optionKey` moram em @ecommerce/shared/contracts — os dois lados
 * usam (a API materializa as variantes, o admin pré-visualiza o grid). Fonte
 * única evita a prévia divergir do que é gravado. Reexportados para quem já
 * importava daqui.
 */
export { cartesian, optionKey } from '@ecommerce/shared/contracts'
export type { OptionSpec } from '@ecommerce/shared/contracts'

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
