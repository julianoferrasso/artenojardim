import { describe, it, expect } from 'vitest'
import { cpfSchema, isValidCpf } from '@ecommerce/shared/constants'
import { confirmCheckoutSchema, updateCustomerProfileSchema } from '@ecommerce/shared/contracts'

// CPFs gerados para teste (dígitos verificadores válidos, não pertencem a ninguém conhecido).
const VALID = ['52998224725', '11144477735', '39053344705']

describe('isValidCpf', () => {
  it.each(VALID)('aceita %s', (cpf) => expect(isValidCpf(cpf)).toBe(true))

  it('aceita com máscara', () => expect(isValidCpf('529.982.247-25')).toBe(true))

  it('recusa dígito verificador errado', () => {
    expect(isValidCpf('52998224724')).toBe(false)
    expect(isValidCpf('52998224715')).toBe(false)
  })

  it('recusa sequência repetida, que passa na conta', () => {
    expect(isValidCpf('11111111111')).toBe(false)
    expect(isValidCpf('000.000.000-00')).toBe(false)
  })

  it('recusa tamanho errado e CNPJ', () => {
    expect(isValidCpf('5299822472')).toBe(false)
    expect(isValidCpf('11222333000181')).toBe(false)
    expect(isValidCpf('')).toBe(false)
  })
})

describe('cpfSchema', () => {
  it('normaliza para 11 dígitos', () => {
    expect(cpfSchema.parse('529.982.247-25')).toBe('52998224725')
  })

  it('vale no checkout e no perfil', () => {
    const base = { addressId: 'a1', shippingServiceId: '35' }
    expect(confirmCheckoutSchema.parse({ ...base, document: '529.982.247-25' }).document).toBe('52998224725')
    expect(confirmCheckoutSchema.parse(base).document).toBeUndefined()
    expect(confirmCheckoutSchema.safeParse({ ...base, document: '123.456.789-00' }).success).toBe(false)
    expect(updateCustomerProfileSchema.safeParse({ document: '111.111.111-11' }).success).toBe(false)
    expect(updateCustomerProfileSchema.parse({ document: '111.444.777-35' }).document).toBe('11144477735')
  })
})
