import { describe, it, expect } from 'vitest'
import { createProductSchema, updateProductSchema } from '@ecommerce/shared/contracts'

// No Zod 4, `.partial()` não anula `.default()`. Um update derivado do create
// fazia "Publicar" apagar as categorias e "Salvar informações" despublicar.
describe('updateProductSchema', () => {
  it('não injeta defaults em campos ausentes', () => {
    expect(updateProductSchema.parse({ status: 'ACTIVE' })).toEqual({ status: 'ACTIVE' })
    expect(updateProductSchema.parse({ categoryIds: ['c1'] })).toEqual({ categoryIds: ['c1'] })
    expect(updateProductSchema.parse({ isFeatured: true })).toEqual({ isFeatured: true })
  })
})

describe('createProductSchema', () => {
  it('mantém os defaults da criação', () => {
    const parsed = createProductSchema.parse({
      name: 'Vela',
      variants: [{ sku: 'V1', price: 1000, weight: 100, length: 90, width: 90, height: 110 }],
    })
    expect(parsed).toMatchObject({
      status: 'DRAFT',
      tags: [],
      categoryIds: [],
      images: [],
      isFeatured: false,
    })
  })
})

describe('política de venda e prazo de produção', () => {
  const base = {
    name: 'Vela',
    variants: [{ sku: 'V1', price: 1000, weight: 100, length: 90, width: 90, height: 110 }],
  }

  it('o update não injeta a política nem o prazo (o default do Zod 4 voltaria tudo a pronta entrega)', () => {
    expect(updateProductSchema.parse({ name: 'Outra' })).toEqual({ name: 'Outra' })
    expect(updateProductSchema.parse({ stockPolicy: 'MADE_TO_ORDER' })).toEqual({ stockPolicy: 'MADE_TO_ORDER' })
  })

  it('a criação nasce pronta entrega, sem prazo', () => {
    expect(createProductSchema.parse(base)).toMatchObject({ stockPolicy: 'STOCK_ONLY', productionDays: null })
  })

  it('a criação sob encomenda exige o prazo', () => {
    expect(createProductSchema.safeParse({ ...base, stockPolicy: 'MADE_TO_ORDER' }).success).toBe(false)
    expect(createProductSchema.safeParse({ ...base, stockPolicy: 'STOCK_THEN_MADE_TO_ORDER' }).success).toBe(false)
    expect(
      createProductSchema.safeParse({ ...base, stockPolicy: 'MADE_TO_ORDER', productionDays: 7 }).success,
    ).toBe(true)
  })

  it('o prazo vai de 1 a 60 dias úteis, inteiro', () => {
    for (const productionDays of [0, 61, 2.5]) {
      expect(updateProductSchema.safeParse({ productionDays }).success, String(productionDays)).toBe(false)
    }
    expect(updateProductSchema.safeParse({ productionDays: 60 }).success).toBe(true)
    expect(updateProductSchema.safeParse({ productionDays: null }).success).toBe(true)
  })
})
