import { describe, it, expect } from 'vitest'
import { centsToMp, mpToCents } from '../src/integrations/mercadopago/money.js'

/**
 * Centavo errado aqui é cobrança errada. A conversão é por texto porque por float
 * 19.99 * 100 vira 1998.9999999999998.
 */

describe('centsToMp', () => {
  it('formata com duas casas', () => {
    expect(centsToMp(1)).toBe('0.01')
    expect(centsToMp(10)).toBe('0.10')
    expect(centsToMp(1999)).toBe('19.99')
    expect(centsToMp(10500)).toBe('105.00')
    expect(centsToMp(0)).toBe('0.00')
  })

  it('recusa valor que não é centavo inteiro', () => {
    expect(() => centsToMp(19.99)).toThrow()
    expect(() => centsToMp(-1)).toThrow()
  })
})

describe('mpToCents', () => {
  it('lê o formato do MP', () => {
    expect(mpToCents('19.99')).toBe(1999)
    expect(mpToCents('105.00')).toBe(10500)
    expect(mpToCents('20')).toBe(2000)
    expect(mpToCents('0.1')).toBe(10)
    expect(mpToCents(50)).toBe(5000)
  })

  it('ausente vale zero', () => {
    expect(mpToCents(undefined)).toBe(0)
    expect(mpToCents(null)).toBe(0)
    expect(mpToCents('')).toBe(0)
  })

  it('formato inesperado é erro, não um valor inventado', () => {
    expect(() => mpToCents('19,99')).toThrow()
    expect(() => mpToCents('1.999')).toThrow()
    expect(() => mpToCents('-5.00')).toThrow()
  })

  it('vai e volta sem perder centavo', () => {
    for (const cents of [1, 99, 100, 1999, 123456, 99999999]) {
      expect(mpToCents(centsToMp(cents))).toBe(cents)
    }
  })
})
