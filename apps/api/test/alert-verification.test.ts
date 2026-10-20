import { describe, it, expect } from 'vitest'
import {
  RESEND_COOLDOWN_MS,
  attemptsLeftMessage,
  codeDigestInput,
  pendingStepOf,
  resendWaitMs,
} from '../src/modules/alerts/domain/verification.js'
import { generateNumericCode } from '../src/utils/crypto.js'

/**
 * As regras do código que confirma um destino de alerta. O que importa: o código
 * tem sempre 6 dígitos (zero à esquerda incluso), o reenvio respeita a espera, e
 * o Telegram sem chat pede o link — não um código que ainda não tem para onde ir.
 */

describe('generateNumericCode', () => {
  it('sempre com o tamanho pedido, só dígitos — zero à esquerda não some', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateNumericCode(6)).toMatch(/^\d{6}$/)
    }
  })
})

describe('resendWaitMs', () => {
  const now = new Date('2026-10-20T12:00:00Z')

  it('sem código enviado, pode pedir na hora', () => {
    expect(resendWaitMs(null, now)).toBe(0)
  })

  it('logo depois do envio, espera o resto do minuto', () => {
    const sentAt = new Date(now.getTime() - 15_000)
    expect(resendWaitMs(sentAt, now)).toBe(RESEND_COOLDOWN_MS - 15_000)
  })

  it('passado o minuto, libera', () => {
    const sentAt = new Date(now.getTime() - RESEND_COOLDOWN_MS - 1)
    expect(resendWaitMs(sentAt, now)).toBe(0)
  })
})

describe('pendingStepOf', () => {
  it('verificado não tem passo pendente', () => {
    expect(pendingStepOf({ channel: 'EMAIL', address: 'a@b.com', verifiedAt: new Date() })).toBeNull()
  })

  it('Telegram sem chat espera o "Iniciar" no link', () => {
    expect(pendingStepOf({ channel: 'TELEGRAM', address: null, verifiedAt: null })).toBe('telegram_link')
  })

  it('Telegram já vinculado e e-mail pendente esperam o código', () => {
    expect(pendingStepOf({ channel: 'TELEGRAM', address: '123', verifiedAt: null })).toBe('code')
    expect(pendingStepOf({ channel: 'EMAIL', address: 'a@b.com', verifiedAt: null })).toBe('code')
  })
})

describe('codeDigestInput', () => {
  it('o mesmo código em dois destinos não vira a mesma entrada de hash', () => {
    expect(codeDigestInput('dest_a', '123456')).not.toBe(codeDigestInput('dest_b', '123456'))
  })
})

describe('attemptsLeftMessage', () => {
  it('singular e plural', () => {
    expect(attemptsLeftMessage(1)).toBe('Resta 1 tentativa.')
    expect(attemptsLeftMessage(3)).toBe('Restam 3 tentativas.')
  })
})
