import { describe, it, expect } from 'vitest'
import { threadUpdateAfterMessage, threadUpdateForStatus } from '../src/modules/support/domain/thread.js'

/**
 * A situação da conversa diz de quem é a vez. O erro caro é a mensagem do
 * cliente cair numa conversa que fica ENCERRADA: ela some da fila "aguardando
 * resposta" e ninguém responde.
 */

const now = new Date('2026-10-19T12:00:00Z')

describe('threadUpdateAfterMessage', () => {
  it('mensagem do cliente devolve a vez à loja e marca a espera', () => {
    expect(threadUpdateAfterMessage('CUSTOMER', now)).toEqual({
      status: 'OPEN',
      lastMessageAt: now,
      lastCustomerMessageAt: now,
      closedAt: null,
    })
  })

  it('mensagem do cliente reabre conversa encerrada (closedAt volta a null)', () => {
    expect(threadUpdateAfterMessage('CUSTOMER', now).closedAt).toBeNull()
  })

  it('resposta da loja ou texto do sistema passa a vez ao cliente', () => {
    for (const author of ['STAFF', 'SYSTEM'] as const) {
      const update = threadUpdateAfterMessage(author, now)
      expect(update.status).toBe('ANSWERED')
      expect(update.lastMessageAt).toBe(now)
      // A espera do cliente não muda quando quem fala é a loja.
      expect(update.lastCustomerMessageAt).toBeUndefined()
    }
  })
})

describe('threadUpdateForStatus', () => {
  it('encerrar grava quando', () => {
    expect(threadUpdateForStatus('CLOSED', now)).toEqual({ status: 'CLOSED', closedAt: now })
  })

  it('reabrir devolve a vez à loja', () => {
    expect(threadUpdateForStatus('OPEN', now)).toEqual({ status: 'OPEN', closedAt: null })
  })
})
