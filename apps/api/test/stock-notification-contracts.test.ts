import { describe, it, expect } from 'vitest'
import { createStockNotificationSchema } from '@ecommerce/shared/contracts'

/**
 * O pedido de "Avise-me" é público: o contrato é a primeira barreira. O e-mail
 * chega normalizado, para o unique (variação, e-mail) não aceitar o mesmo
 * endereço duas vezes com caixa diferente.
 */

describe('createStockNotificationSchema', () => {
  it('normaliza o e-mail (espaços e maiúsculas)', () => {
    const parsed = createStockNotificationSchema.parse({ variantId: 'var_1', email: '  Maria@Exemplo.COM ' })
    expect(parsed.email).toBe('maria@exemplo.com')
  })

  it('recusa e-mail inválido', () => {
    expect(createStockNotificationSchema.safeParse({ variantId: 'var_1', email: 'maria@' }).success).toBe(false)
  })

  it('exige a variação', () => {
    expect(createStockNotificationSchema.safeParse({ variantId: '', email: 'maria@exemplo.com' }).success).toBe(false)
    expect(createStockNotificationSchema.safeParse({ email: 'maria@exemplo.com' }).success).toBe(false)
  })
})
