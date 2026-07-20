import { describe, it, expect } from 'vitest'
import {
  buildCustomerTimeline,
  CUSTOMER_EVENT_VIEW,
  CUSTOMER_HIDDEN_EVENTS,
  CUSTOMER_TIMELINE_STEPS,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'

/**
 * A timeline do cliente é uma fronteira de confiança: o que passa por
 * `buildCustomerTimeline` sai da API e vai para a tela de quem comprou. Um
 * evento novo que ninguém classificou não pode vazar por omissão — daí o teste
 * exaustivo sobre EVENTS.order.
 */

let seq = 0
const event = (type: string, createdAt: string, description = 'texto do evento') => ({
  id: `evt_${(seq += 1)}`,
  type,
  description,
  createdAt,
})

describe('whitelist de eventos', () => {
  it('todo evento de pedido está classificado como visível OU explicitamente oculto', () => {
    for (const type of Object.values(EVENTS.order)) {
      const classified = type in CUSTOMER_EVENT_VIEW || CUSTOMER_HIDDEN_EVENTS.includes(type)
      expect(classified, `evento "${type}" não foi classificado para a área do cliente`).toBe(true)
    }
  })

  it('nenhum evento está nos dois lados ao mesmo tempo', () => {
    for (const type of CUSTOMER_HIDDEN_EVENTS) {
      expect(CUSTOMER_EVENT_VIEW[type]).toBeUndefined()
    }
  })

  it('nota interna e pedido de reembolso nunca chegam ao cliente', () => {
    const { entries } = buildCustomerTimeline(
      [
        event(EVENTS.order.noteAdded, '2026-01-02T10:00:00Z', 'cliente é chato, cobrar adiantado'),
        event(EVENTS.order.refundRequested, '2026-01-03T10:00:00Z', 'estorno pedido ao Stripe'),
        event(EVENTS.order.created, '2026-01-01T10:00:00Z'),
      ],
      { canceled: false },
    )

    expect(entries.map((e) => e.type)).toEqual([EVENTS.order.created])
  })
})

describe('texto dos eventos', () => {
  it('não expõe a descrição escrita por staff, mesmo em evento visível', () => {
    const { entries } = buildCustomerTimeline(
      [event(EVENTS.order.canceled, '2026-01-02T10:00:00Z', 'Pedido cancelado: suspeita de fraude')],
      { canceled: true },
    )

    expect(entries).toHaveLength(1)
    expect(entries[0]?.label).toBe('Pedido cancelado')
    expect(entries[0]?.detail).toBeNull()
  })

  it('expõe o texto quando foi o próprio cliente que escreveu', () => {
    const { entries } = buildCustomerTimeline(
      [event(EVENTS.order.supportMessage, '2026-01-02T10:00:00Z', 'chegou faltando uma vela')],
      { canceled: false },
    )

    expect(entries[0]?.detail).toBe('chegou faltando uma vela')
  })
})

describe('escada de progresso', () => {
  it('ordena cronologicamente mesmo recebendo os eventos fora de ordem', () => {
    const { entries } = buildCustomerTimeline(
      [
        event(EVENTS.order.shipped, '2026-01-05T10:00:00Z'),
        event(EVENTS.order.created, '2026-01-01T10:00:00Z'),
        event(EVENTS.order.paid, '2026-01-02T10:00:00Z'),
      ],
      { canceled: false },
    )

    expect(entries.map((e) => e.type)).toEqual([
      EVENTS.order.created,
      EVENTS.order.paid,
      EVENTS.order.shipped,
    ])
  })

  it('posiciona "saiu para entrega" entre enviado e entregue', () => {
    const keys = CUSTOMER_TIMELINE_STEPS
    expect(keys.indexOf('OUT_FOR_DELIVERY')).toBeGreaterThan(keys.indexOf('SHIPPED'))
    expect(keys.indexOf('OUT_FOR_DELIVERY')).toBeLessThan(keys.indexOf('DELIVERED'))
  })

  it('marca os passos alcançados e deixa null os que faltam', () => {
    const { steps } = buildCustomerTimeline(
      [
        event(EVENTS.order.created, '2026-01-01T10:00:00Z'),
        event(EVENTS.order.paid, '2026-01-02T10:00:00Z'),
      ],
      { canceled: false },
    )

    const byKey = Object.fromEntries(steps.map((s) => [s.key, s.reachedAt]))
    expect(byKey.PLACED).toBe('2026-01-01T10:00:00.000Z')
    expect(byKey.PAID).toBe('2026-01-02T10:00:00.000Z')
    expect(byKey.SHIPPED).toBeNull()
    expect(byKey.DELIVERED).toBeNull()
  })

  it('a primeira ocorrência de um passo vence a repetição', () => {
    const { steps } = buildCustomerTimeline(
      [
        event(EVENTS.order.shipped, '2026-01-05T10:00:00Z'),
        event(EVENTS.order.shipped, '2026-01-09T10:00:00Z'),
      ],
      { canceled: false },
    )

    expect(steps.find((s) => s.key === 'SHIPPED')?.reachedAt).toBe('2026-01-05T10:00:00.000Z')
  })

  it('pedido cancelado não recebe escada, mas mantém o histórico', () => {
    const { entries, steps } = buildCustomerTimeline(
      [
        event(EVENTS.order.created, '2026-01-01T10:00:00Z'),
        event(EVENTS.order.canceled, '2026-01-02T10:00:00Z'),
      ],
      { canceled: true },
    )

    expect(steps).toEqual([])
    expect(entries).toHaveLength(2)
  })
})
