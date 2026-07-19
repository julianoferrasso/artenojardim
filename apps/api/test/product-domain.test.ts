import { describe, it, expect } from 'vitest'
import {
  cartesian,
  optionKey,
  validateVariants,
  deriveOptions,
} from '../src/modules/products/domain/variants.js'
import { publishBlockers } from '../src/modules/products/domain/publish.js'
import type { CreateVariantInput } from '@ecommerce/shared/contracts'

const variant = (over: Partial<CreateVariantInput> = {}): CreateVariantInput => ({
  sku: 'SKU-1',
  price: 1000,
  weight: 500,
  length: 0,
  width: 0,
  height: 0,
  position: 0,
  isActive: true,
  options: [],
  ...over,
})

describe('cartesian', () => {
  it('sem opções → uma combinação vazia (a variante Default)', () => {
    expect(cartesian([])).toEqual([[]])
  })

  it('uma opção com 2 valores → 2 combinações', () => {
    expect(cartesian([{ name: 'Cor', values: ['Verde', 'Terracota'] }])).toEqual([
      [{ option: 'Cor', value: 'Verde' }],
      [{ option: 'Cor', value: 'Terracota' }],
    ])
  })

  it('2 opções (2×2) → 4 combinações, ordem estável', () => {
    const result = cartesian([
      { name: 'Cor', values: ['Verde', 'Terracota'] },
      { name: 'Tam', values: ['P', 'G'] },
    ])
    expect(result).toHaveLength(4)
    expect(result[0]).toEqual([
      { option: 'Cor', value: 'Verde' },
      { option: 'Tam', value: 'P' },
    ])
    expect(result[3]).toEqual([
      { option: 'Cor', value: 'Terracota' },
      { option: 'Tam', value: 'G' },
    ])
  })

  it('3×2×2 = 12 combinações', () => {
    expect(
      cartesian([
        { name: 'A', values: ['1', '2', '3'] },
        { name: 'B', values: ['x', 'y'] },
        { name: 'C', values: ['m', 'n'] },
      ]),
    ).toHaveLength(12)
  })
})

describe('optionKey', () => {
  it('mesma combinação em ordens diferentes gera a mesma chave', () => {
    const a = optionKey([
      { option: 'Cor', value: 'Verde' },
      { option: 'Tam', value: 'G' },
    ])
    const b = optionKey([
      { option: 'Tam', value: 'G' },
      { option: 'Cor', value: 'Verde' },
    ])
    expect(a).toBe(b)
  })

  it('ignora caixa e espaços', () => {
    expect(optionKey([{ option: ' Cor ', value: 'VERDE' }])).toBe(
      optionKey([{ option: 'cor', value: 'verde' }]),
    )
  })
})

describe('validateVariants', () => {
  it('conjunto válido não tem erros', () => {
    expect(
      validateVariants([
        variant({ sku: 'A', options: [{ option: 'Cor', value: 'Verde' }] }),
        variant({ sku: 'B', options: [{ option: 'Cor', value: 'Azul' }] }),
      ]),
    ).toEqual([])
  })

  it('pega SKU duplicado', () => {
    const errs = validateVariants([variant({ sku: 'X' }), variant({ sku: 'X', options: [] })])
    expect(errs.some((e) => e.code === 'DUPLICATE_SKU')).toBe(true)
  })

  it('pega combinação de opções repetida', () => {
    const errs = validateVariants([
      variant({ sku: 'A', options: [{ option: 'Cor', value: 'Verde' }] }),
      variant({ sku: 'B', options: [{ option: 'Cor', value: 'Verde' }] }),
    ])
    expect(errs.some((e) => e.code === 'DUPLICATE_OPTIONS')).toBe(true)
  })

  it('pega conjuntos de opção inconsistentes entre variantes', () => {
    const errs = validateVariants([
      variant({ sku: 'A', options: [{ option: 'Cor', value: 'Verde' }] }),
      variant({
        sku: 'B',
        options: [
          { option: 'Cor', value: 'Azul' },
          { option: 'Tam', value: 'G' },
        ],
      }),
    ])
    expect(errs.some((e) => e.code === 'INCONSISTENT_OPTIONS')).toBe(true)
  })

  it('produto sem opções (todas variantes vazias) é consistente', () => {
    expect(validateVariants([variant({ sku: 'A', options: [] })])).toEqual([])
  })
})

describe('deriveOptions', () => {
  it('extrai opções e valores distintos das variantes', () => {
    const opts = deriveOptions([
      variant({
        sku: 'A',
        options: [
          { option: 'Cor', value: 'Verde' },
          { option: 'Tam', value: 'P' },
        ],
      }),
      variant({
        sku: 'B',
        options: [
          { option: 'Cor', value: 'Azul' },
          { option: 'Tam', value: 'P' },
        ],
      }),
    ])
    expect(opts).toEqual([
      { name: 'Cor', values: ['Verde', 'Azul'] },
      { name: 'Tam', values: ['P'] }, // P aparece 2x, listado 1x
    ])
  })
})

describe('publishBlockers', () => {
  const ok = { imageCount: 1, variants: [{ isActive: true, price: 1000, weight: 500 }] }

  it('produto completo pode publicar', () => {
    expect(publishBlockers(ok)).toEqual([])
  })

  it('sem imagem bloqueia', () => {
    expect(publishBlockers({ ...ok, imageCount: 0 })).toContain('NO_IMAGE')
  })

  it('sem variante ativa bloqueia e nem checa preço/peso', () => {
    const b = publishBlockers({ imageCount: 1, variants: [{ isActive: false, price: 0, weight: 0 }] })
    expect(b).toEqual(['NO_ACTIVE_VARIANT'])
  })

  it('variante ativa sem preço bloqueia', () => {
    expect(
      publishBlockers({ imageCount: 1, variants: [{ isActive: true, price: 0, weight: 500 }] }),
    ).toContain('VARIANT_WITHOUT_PRICE')
  })

  it('variante ativa sem peso bloqueia (frete)', () => {
    expect(
      publishBlockers({ imageCount: 1, variants: [{ isActive: true, price: 1000, weight: 0 }] }),
    ).toContain('VARIANT_WITHOUT_WEIGHT')
  })

  it('variante INATIVA sem preço/peso não bloqueia', () => {
    const b = publishBlockers({
      imageCount: 1,
      variants: [
        { isActive: true, price: 1000, weight: 500 },
        { isActive: false, price: 0, weight: 0 },
      ],
    })
    expect(b).toEqual([])
  })
})
