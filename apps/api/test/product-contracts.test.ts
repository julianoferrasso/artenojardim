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
