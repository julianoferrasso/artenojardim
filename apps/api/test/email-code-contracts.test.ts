import { describe, it, expect } from 'vitest'
import {
  changePasswordSchema,
  emailCodeSchema,
  internalPathSchema,
  registerSchema,
  verifyEmailCodeSchema,
} from '@ecommerce/shared/contracts'
import { suggestEmailDomain } from '@ecommerce/shared/utils'
import { renderEmailCode } from '../src/integrations/email/templates/email-code.js'
import { renderVerifyEmail } from '../src/integrations/email/templates/verify-email.js'

const branding = { storeName: 'Loja', storeUrl: 'https://loja.test', logoUrl: null }

describe('contratos do código por e-mail', () => {
  it('o código aceita o que vem colado do e-mail', () => {
    expect(emailCodeSchema.parse('123 456')).toBe('123456')
    expect(emailCodeSchema.parse('123-456')).toBe('123456')
    expect(emailCodeSchema.safeParse('12345').success).toBe(false)
    expect(emailCodeSchema.safeParse('1234567').success).toBe(false)
  })

  it('o nome, quando vem, tem de ser um nome', () => {
    expect(verifyEmailCodeSchema.safeParse({ email: 'a@b.co', code: '123456', name: ' ' }).success).toBe(false)
    expect(verifyEmailCodeSchema.parse({ email: 'A@B.co', code: '123456' })).toEqual({
      email: 'a@b.co',
      code: '123456',
    })
  })

  it('o next só aceita caminho da própria loja', () => {
    expect(internalPathSchema.safeParse('/checkout').success).toBe(true)
    expect(internalPathSchema.safeParse('/conta/pedidos?x=1').success).toBe(true)
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'checkout', '']) {
      expect(internalPathSchema.safeParse(bad).success, bad).toBe(false)
    }
  })

  it('o cadastro descarta a senha: ela só existe depois da confirmação', () => {
    const parsed = registerSchema.parse({ name: 'Ana', email: 'ana@loja.test', password: 'segredo1' })
    expect(parsed).not.toHaveProperty('password')
  })

  it('a primeira senha dispensa a senha atual no formato', () => {
    expect(changePasswordSchema.safeParse({ password: 'nova-senha' }).success).toBe(true)
    expect(changePasswordSchema.safeParse({ currentPassword: 'igual1', password: 'igual1' }).success).toBe(false)
  })
})

describe('sugestão de domínio do e-mail', () => {
  it.each([
    ['ana@gmial.com', 'ana@gmail.com'],
    ['ana@gamil.com', 'ana@gmail.com'],
    ['ana@gmail.co', 'ana@gmail.com'],
    ['ana@gmail.com.br', 'ana@gmail.com'],
    ['ana@hotmial.com', 'ana@hotmail.com'],
    ['ana@outlok.com', 'ana@outlook.com'],
    ['ana@yaho.com.br', 'ana@yahoo.com.br'],
  ])('%s → %s', (typed, expected) => expect(suggestEmailDomain(typed)).toBe(expected))

  it.each(['ana@gmail.com', 'ana@hotmail.com.br', 'ana@mail.com', 'ana@empresa.com.br', 'ana@usp.br', 'ana', 'ana@'])(
    'não sugere para %s',
    (typed) => expect(suggestEmailDomain(typed)).toBeNull(),
  )
})

describe('e-mail do código', () => {
  it('leva o código no assunto e no corpo, e nenhum link', () => {
    const mail = renderEmailCode({ branding, code: '482913', expiresInMinutes: 10 })
    expect(mail.subject).toBe('482913 é o seu código — Loja')
    expect(mail.html).toContain('482913')
    expect(mail.text).toContain('Seu código: 482913')
    expect(mail.html).not.toContain('<a href="https://loja.test/entrar')
    expect(mail.text).not.toContain('copie e cole')
  })

  it('o do cadastro leva código E o botão "Confirmar e entrar"', () => {
    const mail = renderVerifyEmail({
      branding,
      customerName: 'Ana Souza',
      code: { value: '482913', expiresInMinutes: 10 },
      verifyUrl: 'https://loja.test/entrar/verificar-email?token=t',
      expiresInHours: 24,
    })
    expect(mail.subject.startsWith('482913')).toBe(true)
    expect(mail.html).toContain('Confirmar e entrar')
    expect(mail.text).toContain('Confirmar e entrar: https://loja.test/entrar/verificar-email?token=t')
  })
})
