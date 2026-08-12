import { describe, it, expect } from 'vitest'
import { maskEmail } from '../src/modules/customer-profile/domain/mask-email.js'

describe('maskEmail', () => {
  it.each([
    ['joao@gmail.com', 'j••o@gmail.com'],
    ['joao.silva@gmail.com', 'j••••••••a@gmail.com'],
    ['ana+loja@dominio.com.br', 'a••••••a@dominio.com.br'],
    ['abc@x.com', 'a•c@x.com'],
  ])('%s -> %s', (input, expected) => {
    expect(maskEmail(input)).toBe(expected)
  })

  it('preserva o domínio inteiro — é o que deixa o dono reconhecer "isso não é meu"', () => {
    expect(maskEmail('qualquer@empresa.com.br').endsWith('@empresa.com.br')).toBe(true)
  })

  it('com 1 ou 2 caracteres esconde tudo: preservar as pontas entregaria o endereço', () => {
    expect(maskEmail('a@x.com')).toBe('•@x.com')
    expect(maskEmail('ab@x.com')).toBe('••@x.com')
  })

  it('sem @ não vaza o valor cru', () => {
    expect(maskEmail('naoehemail')).toBe('•••')
    expect(maskEmail('@semlocal.com')).toBe('•••')
  })

  it('usa o ÚLTIMO @: o primeiro pode fazer parte da parte local entre aspas', () => {
    expect(maskEmail('a@b@dominio.com')).toBe('a•b@dominio.com')
  })
})
