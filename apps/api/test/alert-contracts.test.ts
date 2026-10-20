import { describe, it, expect } from 'vitest'
import {
  alertSettingsSchema,
  createAlertDestinationSchema,
  updateAlertDestinationSchema,
  verifyAlertCodeSchema,
  whatsappNumberSchema,
} from '@ecommerce/shared/contracts'

/**
 * O formato HTTP dos alertas. O que importa: o número sai no E.164 que a Meta
 * recebe, o PATCH não inventa campo (a armadilha do Zod 4 que já despublicou
 * produto), e o código tem exatamente 6 dígitos.
 */

describe('whatsappNumberSchema', () => {
  it('DDD + número vira 55…, com ou sem máscara', () => {
    expect(whatsappNumberSchema.parse('(54) 99999-8888')).toBe('5554999998888')
    expect(whatsappNumberSchema.parse('54 3222-1111')).toBe('555432221111')
  })

  it('aceita o 55 digitado e o + de outro país', () => {
    expect(whatsappNumberSchema.parse('+55 54 99999-8888')).toBe('5554999998888')
    expect(whatsappNumberSchema.parse('55 54 99999 8888')).toBe('5554999998888')
    expect(whatsappNumberSchema.parse('+1 202 555 0123')).toBe('12025550123')
  })

  it('recusa o que não é telefone', () => {
    expect(whatsappNumberSchema.safeParse('9999-8888').success).toBe(false)
    expect(whatsappNumberSchema.safeParse('(04) 99999-8888').success).toBe(false)
    expect(whatsappNumberSchema.safeParse('abc').success).toBe(false)
    expect(whatsappNumberSchema.safeParse('+12').success).toBe(false)
  })
})

describe('createAlertDestinationSchema', () => {
  it('e-mail minúsculo e sem espaço', () => {
    expect(createAlertDestinationSchema.parse({ channel: 'EMAIL', label: ' Equipe ', email: ' Ana@Loja.COM ' })).toEqual({
      channel: 'EMAIL',
      label: 'Equipe',
      email: 'ana@loja.com',
    })
  })

  it('cada canal pede o seu campo: WhatsApp sem telefone não passa', () => {
    expect(createAlertDestinationSchema.safeParse({ channel: 'WHATSAPP', label: 'Ana' }).success).toBe(false)
    expect(createAlertDestinationSchema.safeParse({ channel: 'TELEGRAM', label: 'Ana' }).success).toBe(true)
  })

  it('nome é obrigatório', () => {
    expect(createAlertDestinationSchema.safeParse({ channel: 'TELEGRAM', label: '  ' }).success).toBe(false)
  })
})

describe('updateAlertDestinationSchema', () => {
  it('só o que veio: pausar não reescreve os eventos nem o nome', () => {
    expect(updateAlertDestinationSchema.parse({ enabled: false })).toEqual({ enabled: false })
  })

  it('eventos repetidos viram um só; tipo desconhecido é recusado', () => {
    expect(updateAlertDestinationSchema.parse({ events: ['ORDER_PAID', 'ORDER_PAID', 'LOW_STOCK'] })).toEqual({
      events: ['ORDER_PAID', 'LOW_STOCK'],
    })
    expect(updateAlertDestinationSchema.safeParse({ events: ['NADA'] }).success).toBe(false)
  })

  it('corpo vazio é erro, não um PATCH que não faz nada', () => {
    expect(updateAlertDestinationSchema.safeParse({}).success).toBe(false)
  })
})

describe('verifyAlertCodeSchema e alertSettingsSchema', () => {
  it('código de 6 dígitos exatos', () => {
    expect(verifyAlertCodeSchema.parse({ code: ' 012345 ' })).toEqual({ code: '012345' })
    expect(verifyAlertCodeSchema.safeParse({ code: '12345' }).success).toBe(false)
    expect(verifyAlertCodeSchema.safeParse({ code: '12345a' }).success).toBe(false)
  })

  it('limite de estoque inteiro de 0 a 999', () => {
    expect(alertSettingsSchema.safeParse({ lowStockThreshold: 0 }).success).toBe(true)
    expect(alertSettingsSchema.safeParse({ lowStockThreshold: -1 }).success).toBe(false)
    expect(alertSettingsSchema.safeParse({ lowStockThreshold: 2.5 }).success).toBe(false)
  })
})
