import { describe, it, expect } from 'vitest'
import { refundableOf, refundIdempotencyKey } from '../src/modules/payments/domain/refund.js'

/**
 * A chave de idempotência é o que impede dois estornos do mesmo dinheiro: o
 * cliente cancelando e o webhook atrasado do pagamento podem pedir o estorno
 * quase juntos — e têm de pedir com a MESMA chave.
 */

describe('refundIdempotencyKey', () => {
  it('mesmo estado, mesma chave — clique duplo e caminhos cruzados viram um estorno só', () => {
    expect(refundIdempotencyKey('ord_1', 0, 5000, 0)).toBe(refundIdempotencyKey('ord_1', 0, 5000, 0))
  })

  it('mantém o formato antigo sem falha anterior (chaves já usadas no MP continuam valendo)', () => {
    expect(refundIdempotencyKey('ord_1', 0, 5000, 0)).toBe('refund_ord_1_0_5000')
  })

  it('dois parciais iguais e legítimos têm chaves diferentes (o já reembolsado mudou)', () => {
    expect(refundIdempotencyKey('ord_1', 0, 1000, 0)).not.toBe(refundIdempotencyKey('ord_1', 1000, 1000, 0))
  })

  it('depois de uma recusa, a chave renova — senão o provedor devolveria a mesma recusa', () => {
    const first = refundIdempotencyKey('ord_1', 0, 5000, 0)
    const retry = refundIdempotencyKey('ord_1', 0, 5000, 1)
    expect(retry).not.toBe(first)
    expect(refundIdempotencyKey('ord_1', 0, 5000, 2)).not.toBe(retry)
  })
})

describe('refundableOf', () => {
  it('é o pago menos o já devolvido', () => {
    expect(refundableOf({ amount: 5000, refundedAmount: 1500 })).toBe(3500)
  })

  it('nunca fica negativo', () => {
    expect(refundableOf({ amount: 5000, refundedAmount: 6000 })).toBe(0)
  })
})
