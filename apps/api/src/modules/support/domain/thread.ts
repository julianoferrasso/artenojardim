import type { SupportAuthor, SupportThreadStatus } from '@ecommerce/shared/constants'

/**
 * Como a conversa muda de situação. PURO: recebe `now` em vez de ler o relógio.
 *
 * A situação diz DE QUEM É A VEZ: mensagem do cliente devolve a vez à loja
 * (OPEN), mesmo numa conversa encerrada — encerrar não pode virar um buraco onde
 * a mensagem nova some. Resposta da loja (ou texto do sistema, como "cancelamento
 * aprovado") passa a vez ao cliente (ANSWERED).
 */

export type ThreadUpdate = {
  status: SupportThreadStatus
  lastMessageAt: Date
  lastCustomerMessageAt?: Date
  closedAt: Date | null
}

export const threadUpdateAfterMessage = (author: SupportAuthor, now: Date): ThreadUpdate =>
  author === 'CUSTOMER'
    ? { status: 'OPEN', lastMessageAt: now, lastCustomerMessageAt: now, closedAt: null }
    : { status: 'ANSWERED', lastMessageAt: now, closedAt: null }

/** Encerrar ou reabrir à mão. Reabrir devolve a vez à loja. */
export const threadUpdateForStatus = (
  status: 'OPEN' | 'CLOSED',
  now: Date,
): { status: SupportThreadStatus; closedAt: Date | null } =>
  status === 'CLOSED' ? { status: 'CLOSED', closedAt: now } : { status: 'OPEN', closedAt: null }
