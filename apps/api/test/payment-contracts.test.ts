import { describe, it, expect } from 'vitest'
import { createCardPaymentSchema } from '@ecommerce/shared/contracts'

const card = {
  token: 'tok_1234567890',
  paymentMethodId: 'master',
  paymentType: 'credit_card',
  installments: 1,
  identification: { type: 'CPF', number: '12345678909' },
} as const

// O device ID vira header HTTP na chamada ao MP: o schema é a fronteira que o
// impede de carregar quebra de linha. E é sinal de antifraude — fora do formato
// ele some, mas nunca recusa o pagamento.
describe('createCardPaymentSchema.deviceId', () => {
  it('aceita o formato do security.js', () => {
    const deviceId = `armor.${'0123456789abcdef'.repeat(14)}0`
    expect(createCardPaymentSchema.parse({ ...card, deviceId }).deviceId).toBe(deviceId)
  })

  it('é opcional', () => {
    expect(createCardPaymentSchema.parse(card).deviceId).toBeUndefined()
  })

  it.each([
    ['quebra de linha', 'armor.x\r\nX-Evil: 1'],
    ['espaço', 'armor x'],
    ['dois-pontos', 'armor:x'],
    ['vazio', ''],
    ['longo demais', 'a'.repeat(513)],
    ['número', 123],
  ])('%s vira ausente sem recusar o pagamento', (_label, deviceId) => {
    const parsed = createCardPaymentSchema.parse({ ...card, deviceId })
    expect(parsed.deviceId).toBeUndefined()
  })

  it('o catch não afrouxa o resto do contrato', () => {
    expect(createCardPaymentSchema.safeParse({ ...card, token: 'x', deviceId: 'armor.ok' }).success).toBe(false)
  })
})
