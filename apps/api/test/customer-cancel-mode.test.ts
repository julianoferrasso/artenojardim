import { describe, it, expect } from 'vitest'
import { customerCancelMode, customerCancelSchema, cancelReasonText } from '@ecommerce/shared/contracts'
import { PAYMENT_STATUSES, FULFILLMENT_STATUSES } from '@ecommerce/shared/constants'
import type { PaymentStatus, FulfillmentStatus } from '@ecommerce/shared/constants'

/**
 * Quanto o cliente pode fazer sozinho. O corte é a prateleira: antes da
 * separação ele cancela (e o pago é estornado automaticamente), durante a
 * separação ele pede, depois do envio não cancela mais.
 *
 * O caso caro é o falso IMMEDIATE fora de UNFULFILLED: cancelar sozinho um
 * pedido que alguém está embalando — ou que já saiu — devolveria estoque e
 * dinheiro de uma caixa que está no caminhão. Por isso a matriz inteira.
 */

const order = (
  paymentStatus: PaymentStatus,
  fulfillmentStatus: FulfillmentStatus,
  canceledAt: string | null = null,
) => ({ paymentStatus, fulfillmentStatus, canceledAt })

const refunded = (p: PaymentStatus) => p === 'REFUNDED' || p === 'PARTIALLY_REFUNDED'

describe('customerCancelMode', () => {
  it('IMMEDIATE acontece SÓ antes da separação e sem reembolso feito — pago ou não', () => {
    for (const p of PAYMENT_STATUSES) {
      for (const f of FULFILLMENT_STATUSES) {
        const expected = f === 'UNFULFILLED' && !refunded(p)
        expect(customerCancelMode(order(p, f)) === 'IMMEDIATE', `${p} + ${f}`).toBe(expected)
      }
    }
  })

  it('pedido pago e ainda não separado cancela na hora (o estorno é automático)', () => {
    expect(customerCancelMode(order('PAID', 'UNFULFILLED'))).toBe('IMMEDIATE')
  })

  it('REQUEST acontece SÓ com a caixa sendo montada', () => {
    for (const p of PAYMENT_STATUSES) {
      for (const f of FULFILLMENT_STATUSES) {
        const expected = (f === 'PICKING' || f === 'READY_TO_SHIP') && !refunded(p)
        expect(customerCancelMode(order(p, f)) === 'REQUEST', `${p} + ${f}`).toBe(expected)
      }
    }
  })

  it('depois do envio não há cancelamento — o caminho é devolução', () => {
    for (const p of PAYMENT_STATUSES) {
      for (const f of ['SHIPPED', 'DELIVERED', 'RETURNED'] as const) {
        expect(customerCancelMode(order(p, f)), `${p} + ${f}`).toBe('NONE')
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

  it('dinheiro já mexido pela loja encerra o self-service', () => {
    for (const f of FULFILLMENT_STATUSES) {
      expect(customerCancelMode(order('REFUNDED', f))).toBe('NONE')
      expect(customerCancelMode(order('PARTIALLY_REFUNDED', f))).toBe('NONE')
    }
  })
})

describe('customerCancelSchema', () => {
  it('aceita o corpo antigo { reason } — a loja em cache durante o deploy', () => {
    const parsed = customerCancelSchema.parse({ reason: 'comprei a vela errada' })
    expect(parsed).toEqual({ reasonCode: 'OTHER', reason: 'comprei a vela errada' })
  })

  it('motivo da lista dispensa o texto', () => {
    expect(customerCancelSchema.safeParse({ reasonCode: 'ORDERED_BY_MISTAKE' }).success).toBe(true)
  })

  it('"Outro" exige o texto: sem ele não há motivo nenhum', () => {
    expect(customerCancelSchema.safeParse({ reasonCode: 'OTHER' }).success).toBe(false)
    expect(customerCancelSchema.safeParse({ reasonCode: 'OTHER', reason: 'abc' }).success).toBe(false)
    expect(customerCancelSchema.safeParse({ reasonCode: 'OTHER', reason: 'mudei de ideia' }).success).toBe(true)
  })

  it('código fora da lista é recusado', () => {
    expect(customerCancelSchema.safeParse({ reasonCode: 'HACK', reason: 'qualquer coisa' }).success).toBe(false)
  })
})

describe('cancelReasonText', () => {
  it('junta o rótulo e o detalhe', () => {
    expect(cancelReasonText({ reasonCode: 'ORDERED_BY_MISTAKE', reason: 'era o aroma errado' })).toBe(
      'Comprei por engano: era o aroma errado',
    )
  })

  it('sem detalhe fica só o rótulo', () => {
    expect(cancelReasonText({ reasonCode: 'FOUND_BETTER_PRICE' })).toBe('Encontrei um preço melhor')
  })

  it('em "Outro" o texto do cliente é o motivo, sem prefixo', () => {
    expect(cancelReasonText({ reasonCode: 'OTHER', reason: 'mudei de ideia' })).toBe('mudei de ideia')
  })
})
