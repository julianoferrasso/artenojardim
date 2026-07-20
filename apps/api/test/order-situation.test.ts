import { describe, it, expect } from 'vitest'
import {
  deriveSituation,
  situationFilter,
  canTransitionFulfillment,
  canCancelOrder,
  ORDER_SITUATIONS,
  FULFILLMENT_TRANSITIONS,
  type OrderSituation,
} from '@ecommerce/shared/contracts'
import { FULFILLMENT_STATUSES, PAYMENT_STATUSES } from '@ecommerce/shared/constants'
import type { PaymentStatus, FulfillmentStatus } from '@ecommerce/shared/constants'

/**
 * A situação unificada e a matriz de transição SÃO a regra de negócio da tela de
 * pedidos. São puras, então testar exaustivamente custa milissegundos — e é o
 * que impede a regressão cara: "o admin conseguiu marcar como pago".
 */

const order = (
  paymentStatus: PaymentStatus,
  fulfillmentStatus: FulfillmentStatus,
  canceledAt: string | null = null,
) => ({ paymentStatus, fulfillmentStatus, canceledAt })

describe('deriveSituation', () => {
  it('cancelado vence qualquer outro eixo', () => {
    for (const p of PAYMENT_STATUSES) {
      for (const f of FULFILLMENT_STATUSES) {
        expect(deriveSituation(order(p, f, '2026-01-01T00:00:00Z'))).toBe('CANCELED')
      }
    }
  })

  it('reembolsado vence a logística (dinheiro devolvido encerra o caso)', () => {
    expect(deriveSituation(order('REFUNDED', 'SHIPPED'))).toBe('REFUNDED')
    expect(deriveSituation(order('PARTIALLY_REFUNDED', 'DELIVERED'))).toBe('REFUNDED')
  })

  it('pedido novo sem pagamento é Aguardando Pagamento', () => {
    expect(deriveSituation(order('PENDING', 'UNFULFILLED'))).toBe('AWAITING_PAYMENT')
    expect(deriveSituation(order('PROCESSING', 'UNFULFILLED'))).toBe('AWAITING_PAYMENT')
  })

  it('pagamento recusado aparece como tal, não como pendente', () => {
    expect(deriveSituation(order('FAILED', 'UNFULFILLED'))).toBe('PAYMENT_FAILED')
  })

  it('pago e ainda não separado é Pago', () => {
    expect(deriveSituation(order('PAID', 'UNFULFILLED'))).toBe('PAID')
  })

  it('READY_TO_SHIP ainda é "Em Separação" para o operador', () => {
    expect(deriveSituation(order('PAID', 'PICKING'))).toBe('PICKING')
    expect(deriveSituation(order('PAID', 'READY_TO_SHIP'))).toBe('PICKING')
  })

  it('logística avançada domina o pagamento', () => {
    expect(deriveSituation(order('PAID', 'SHIPPED'))).toBe('SHIPPED')
    expect(deriveSituation(order('PAID', 'DELIVERED'))).toBe('DELIVERED')
    expect(deriveSituation(order('PAID', 'RETURNED'))).toBe('RETURNED')
  })

  it('devolve sempre uma situação do enum', () => {
    for (const p of PAYMENT_STATUSES) {
      for (const f of FULFILLMENT_STATUSES) {
        expect(ORDER_SITUATIONS).toContain(deriveSituation(order(p, f)))
      }
    }
  })
})

describe('situationFilter × deriveSituation', () => {
  /**
   * O invariante que importa: o filtro da lista e o chip do detalhe não podem
   * discordar. Para cada combinação possível de eixos, o pedido tem que casar
   * com o filtro da sua própria situação — e com nenhum outro.
   */
  const matches = (
    filter: ReturnType<typeof situationFilter>,
    o: ReturnType<typeof order>,
  ): boolean => {
    if (filter.canceled === true && !o.canceledAt) return false
    if (filter.canceled === false && o.canceledAt) return false
    if (filter.paymentStatus && !filter.paymentStatus.includes(o.paymentStatus)) return false
    if (filter.fulfillmentStatus && !filter.fulfillmentStatus.includes(o.fulfillmentStatus))
      return false
    return true
  }

  it('cada pedido casa com o filtro da sua situação e só com ele', () => {
    for (const canceledAt of [null, '2026-01-01T00:00:00Z']) {
      for (const p of PAYMENT_STATUSES) {
        for (const f of FULFILLMENT_STATUSES) {
          const o = order(p, f, canceledAt)
          const own = deriveSituation(o)
          const casam = ORDER_SITUATIONS.filter((s: OrderSituation) => matches(situationFilter(s), o))
          expect(casam, `${p}/${f}/${canceledAt ? 'cancelado' : 'ativo'}`).toEqual([own])
        }
      }
    }
  })
})

describe('canTransitionFulfillment', () => {
  const paid = { paymentStatus: 'PAID' as PaymentStatus, canceled: false }

  it('separar exige pagamento confirmado', () => {
    expect(canTransitionFulfillment('UNFULFILLED', 'PICKING', paid)).toBe(true)
    for (const p of PAYMENT_STATUSES.filter((s) => s !== 'PAID')) {
      expect(canTransitionFulfillment('UNFULFILLED', 'PICKING', { paymentStatus: p, canceled: false })).toBe(false)
    }
  })

  it('pedido cancelado não transiciona para nada', () => {
    for (const from of FULFILLMENT_STATUSES) {
      for (const to of FULFILLMENT_STATUSES) {
        expect(canTransitionFulfillment(from, to, { paymentStatus: 'PAID', canceled: true })).toBe(false)
      }
    }
  })

  it('não há volta de SHIPPED — o caminho é RETURNED', () => {
    expect(canTransitionFulfillment('SHIPPED', 'READY_TO_SHIP', paid)).toBe(false)
    expect(canTransitionFulfillment('SHIPPED', 'PICKING', paid)).toBe(false)
    expect(canTransitionFulfillment('SHIPPED', 'UNFULFILLED', paid)).toBe(false)
    expect(canTransitionFulfillment('SHIPPED', 'RETURNED', paid)).toBe(true)
    expect(canTransitionFulfillment('SHIPPED', 'DELIVERED', paid)).toBe(true)
  })

  it('desfazer erro de clique antes do pacote sair é permitido', () => {
    expect(canTransitionFulfillment('PICKING', 'UNFULFILLED', paid)).toBe(true)
    expect(canTransitionFulfillment('READY_TO_SHIP', 'PICKING', paid)).toBe(true)
  })

  it('RETURNED é terminal', () => {
    for (const to of FULFILLMENT_STATUSES) {
      expect(canTransitionFulfillment('RETURNED', to, paid)).toBe(false)
    }
  })

  it('não permite pular etapas nem transicionar para o mesmo estado', () => {
    expect(canTransitionFulfillment('UNFULFILLED', 'SHIPPED', paid)).toBe(false)
    expect(canTransitionFulfillment('PICKING', 'DELIVERED', paid)).toBe(false)
    for (const f of FULFILLMENT_STATUSES) {
      expect(FULFILLMENT_TRANSITIONS[f]).not.toContain(f)
    }
  })
})

describe('canCancelOrder', () => {
  it('cancela enquanto nada saiu do estoque físico', () => {
    expect(canCancelOrder({ canceledAt: null, fulfillmentStatus: 'UNFULFILLED' })).toBe(true)
    expect(canCancelOrder({ canceledAt: null, fulfillmentStatus: 'PICKING' })).toBe(true)
  })

  it('depois de pronto/enviado não é cancelamento, é devolução', () => {
    for (const f of ['READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'RETURNED'] as const) {
      expect(canCancelOrder({ canceledAt: null, fulfillmentStatus: f })).toBe(false)
    }
  })

  it('cancelar duas vezes não é possível', () => {
    expect(canCancelOrder({ canceledAt: '2026-01-01T00:00:00Z', fulfillmentStatus: 'UNFULFILLED' })).toBe(false)
  })
})
