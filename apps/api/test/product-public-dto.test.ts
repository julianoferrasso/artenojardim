import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/integrations/storage/index.js', () => ({
  storage: () => ({ getPublicUrl: (key: string) => `https://cdn.test/${key}` }),
}))

const { toProductDTO, toListItem } = await import('../src/modules/products/repository.js')
type ProductRow = Parameters<typeof toProductDTO>[0]
type ListRow = Parameters<typeof toListItem>[0]

/**
 * O mesmo produto para dois públicos. A loja nunca pode receber o custo nem as
 * variações aposentadas; o admin recebe tudo, como antes.
 */

const variant = (over: Partial<ProductRow['variants'][number]> = {}): ProductRow['variants'][number] => ({
  id: 'var_1',
  sku: 'VELA-P',
  barcode: null,
  price: 8990,
  compareAtPrice: null,
  costPrice: 3000,
  weight: 300,
  length: 80,
  width: 80,
  height: 90,
  position: 0,
  isActive: true,
  imageId: null,
  level: { onHand: 10, reserved: 0 },
  optionValues: [{ optionValue: { value: 'Lavanda', option: { name: 'Aroma' } } }],
  ...over,
})

const product = (variants: ProductRow['variants']): ProductRow => ({
  id: 'prod_1',
  name: 'Vela Jardim',
  slug: 'vela-jardim',
  description: null,
  shortDescription: null,
  status: 'ACTIVE',
  brand: null,
  tags: [],
  seoTitle: null,
  seoDescription: null,
  isFeatured: false,
  publishedAt: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-02T00:00:00Z'),
  categories: [],
  images: [],
  variants,
})

describe('toProductDTO', () => {
  const row = product([
    variant(),
    variant({ id: 'var_2', sku: 'VELA-M', level: { onHand: 2, reserved: 1 } }),
    variant({ id: 'var_old', sku: 'VELA-OLD', isActive: false, level: { onHand: 9, reserved: 0 } }),
  ])

  it('público: sem custo e sem variação aposentada', () => {
    const dto = toProductDTO(row, { publicOnly: true })
    expect(dto.variants.map((v) => v.id)).toEqual(['var_1', 'var_2'])
    expect(dto.variants.every((v) => v.costPrice === null)).toBe(true)
  })

  it('staff: tudo, com custo', () => {
    const dto = toProductDTO(row, { publicOnly: false })
    expect(dto.variants.map((v) => v.id)).toEqual(['var_1', 'var_2', 'var_old'])
    expect(dto.variants[0]!.costPrice).toBe(3000)
  })

  it('situação por variação, com a contagem só nas últimas unidades', () => {
    const [plenty, low] = toProductDTO(row, { publicOnly: true }).variants
    expect(plenty).toMatchObject({ stockStatus: 'IN_STOCK', lowStockRemaining: null })
    expect(low).toMatchObject({ stockStatus: 'LOW_STOCK', lowStockRemaining: 1 })
  })

  it('agregado ignora a variação aposentada, mesmo com estoque', () => {
    const soldOut = product([
      variant({ level: { onHand: 1, reserved: 1 } }),
      variant({ id: 'var_old', isActive: false, level: { onHand: 9, reserved: 0 } }),
    ])
    expect(toProductDTO(soldOut, { publicOnly: true }).stockStatus).toBe('OUT_OF_STOCK')
    expect(toProductDTO(soldOut, { publicOnly: false }).stockStatus).toBe('OUT_OF_STOCK')
  })

  it('variação sem linha de nível conta como esgotada', () => {
    const dto = toProductDTO(product([variant({ level: null })]), { publicOnly: true })
    expect(dto.variants[0]!.stockStatus).toBe('OUT_OF_STOCK')
    expect(dto.stockStatus).toBe('OUT_OF_STOCK')
  })
})

describe('toListItem', () => {
  const listRow = (levels: Array<{ onHand: number; reserved: number } | null>): ListRow => ({
    id: 'prod_1',
    name: 'Vela Jardim',
    slug: 'vela-jardim',
    status: 'ACTIVE',
    isFeatured: false,
    updatedAt: new Date('2026-10-02T00:00:00Z'),
    images: [],
    variants: levels.map((level) => ({ price: 8990, level })),
  })

  it('esgotado só quando nenhuma variação tem estoque', () => {
    expect(toListItem(listRow([{ onHand: 0, reserved: 0 }, null])).stockStatus).toBe('OUT_OF_STOCK')
    expect(toListItem(listRow([{ onHand: 0, reserved: 0 }, { onHand: 1, reserved: 0 }])).stockStatus).toBe(
      'LOW_STOCK',
    )
    expect(toListItem(listRow([{ onHand: 8, reserved: 2 }])).stockStatus).toBe('IN_STOCK')
  })
})
