import { describe, it, expect } from 'vitest'
import { customerCancelMode } from '@ecommerce/shared/contracts'
import { PAYMENT_STATUSES, FULFILLMENT_STATUSES } from '@ecommerce/shared/constants'
import type { PaymentStatus, FulfillmentStatus } from '@ecommerce/shared/constants'

/**
 * Quanto o cliente pode fazer sozinho. O caso caro é o falso IMMEDIATE: cancelar
 * de verdade um pedido já pago devolveria o estoque sem devolver o dinheiro, e
 * o cliente ficaria sem produto e sem reembolso até alguém notar.
 *
 * Por isso o teste é exaustivo sobre a matriz inteira, e não sobre exemplos.
 */

const order = (
  paymentStatus: PaymentStatus,
  fulfillmentStatus: FulfillmentStatus,
  canceledAt: string | null = null,
) => ({ paymentStatus, fulfillmentStatus, canceledAt })

describe('customerCancelMode', () => {
  it('IMMEDIATE acontece SÓ em (PENDING|FAILED) + UNFULFILLED', () => {
    for (const p of PAYMENT_STATUSES) {
      for (const f of FULFILLMENT_STATUSES) {
        const expected = (p === 'PENDING' || p === 'FAILED') && f === 'UNFULFILLED'
        expect(customerCancelMode(order(p, f)) === 'IMMEDIATE', `${p} + ${f}`).toBe(expected)
      }
    }
  })

  it('pedido já cancelado nunca aceita nova ação', () => {
    for (const p of PAYMENT_STATUSES) {
      for (const f of FULFILLMENT_STATUSES) {
        expect(customerCancelMode(order(p, f, '2026-01-01T00:00:00Z'))).toBe('NONE')
      }
    }
  })

  it('entregue ou devolvido encerra o caso — o caminho é devolução, não cancelamento', () => {
    for (const p of PAYMENT_STATUSES) {
      expect(customerCancelMode(order(p, 'DELIVERED'))).toBe('NONE')
      expect(customerCancelMode(order(p, 'RETURNED'))).toBe('NONE')
    }
  })

  it('dinheiro já devolvido encerra o caso', () => {
    for (const f of FULFILLMENT_STATUSES) {
      expect(customerCancelMode(order('REFUNDED', f))).toBe('NONE')
      expect(customerCancelMode(order('PARTIALLY_REFUNDED', f))).toBe('NONE')
    }
  })

  it('pago e ainda não enviado vira solicitação: há estorno a decidir', () => {
    expect(customerCancelMode(order('PAID', 'UNFULFILLED'))).toBe('REQUEST')
    expect(customerCancelMode(order('PAID', 'PICKING'))).toBe('REQUEST')
    expect(customerCancelMode(order('PAID', 'SHIPPED'))).toBe('REQUEST')
  })

  it('não pago mas já em separação vira solicitação: alguém está montando a caixa', () => {
    expect(customerCancelMode(order('PENDING', 'PICKING'))).toBe('REQUEST')
    expect(customerCancelMode(order('FAILED', 'READY_TO_SHIP'))).toBe('REQUEST')
  })

  it('nunca devolve algo fora dos três modos conhecidos', () => {
    for (const p of PAYMENT_STATUSES) {
      for (const f of FULFILLMENT_STATUSES) {
        expect(['IMMEDIATE', 'REQUEST', 'NONE']).toContain(customerCancelMode(order(p, f)))
      }
    }
  })
})
