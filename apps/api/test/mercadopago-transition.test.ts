import { describe, it, expect } from 'vitest'
import {
  decideMercadoPagoTransition,
  mpTarget,
  mpPaymentMethod,
  type CurrentPayment,
  type MpOrderState,
} from '../src/modules/payments/domain/mercadopago-transition.js'

/**
 * A tabela que decide se um pedido está pago. O que ela não pode fazer nunca:
 * marcar pago com valor menor, nem deixar uma notificação velha desfazer um
 * pagamento.
 */

const processing: CurrentPayment = { status: 'PROCESSING', amount: 10500, refundedAmount: 0 }
const paid: CurrentPayment = { status: 'PAID', amount: 10500, refundedAmount: 0 }

const state = (over: Partial<MpOrderState> = {}): MpOrderState => ({
  status: 'processed',
  statusDetail: 'accredited',
  paidCents: 10500,
  refundedCents: 0,
  payment: { methodId: 'master', methodType: 'credit_card' },
  ...over,
})

describe('mpTarget', () => {
  it('mapeia os status da order', () => {
    expect(mpTarget({ status: 'processed', statusDetail: 'accredited' })).toBe('PAID')
    expect(mpTarget({ status: 'processed', statusDetail: 'partially_refunded' })).toBe('PARTIALLY_REFUNDED')
    expect(mpTarget({ status: 'processed', statusDetail: 'refunded' })).toBe('REFUNDED')
    expect(mpTarget({ status: 'refunded', statusDetail: 'refunded' })).toBe('REFUNDED')
    expect(mpTarget({ status: 'failed', statusDetail: 'failed' })).toBe('FAILED')
    expect(mpTarget({ status: 'canceled', statusDetail: 'canceled' })).toBe('FAILED')
    expect(mpTarget({ status: 'expired', statusDetail: 'expired' })).toBe('FAILED')
    expect(mpTarget({ status: 'charged_back', statusDetail: 'in_process' })).toBe('CHARGEBACK')
  })

  it('status em curso ou desconhecido espera, não decide', () => {
    for (const status of ['created', 'processing', 'action_required', 'in_review', 'status_novo_do_mp']) {
      expect(mpTarget({ status, statusDetail: null })).toBe('PROCESSING')
    }
  })
})

describe('mpPaymentMethod', () => {
  it('reconhece Pix e cartão', () => {
    expect(mpPaymentMethod({ methodId: 'pix', methodType: 'bank_transfer' })).toBe('PIX')
    expect(mpPaymentMethod({ methodId: 'master', methodType: 'credit_card' })).toBe('CARD')
    expect(mpPaymentMethod({ methodId: 'elo', methodType: 'debit_card' })).toBe('CARD')
    expect(mpPaymentMethod({ methodId: 'bolbradesco', methodType: 'ticket' })).toBeNull()
    expect(mpPaymentMethod(null)).toBeNull()
  })
})

describe('decideMercadoPagoTransition', () => {
  it('aprovado com o valor certo → pago, com o método', () => {
    expect(decideMercadoPagoTransition(processing, state())).toEqual({ kind: 'paid', method: 'CARD' })
  })

  it('valor pago acima (juros do parcelado) ainda é pago', () => {
    expect(decideMercadoPagoTransition(processing, state({ paidCents: 11200 })).kind).toBe('paid')
  })

  it('valor pago ABAIXO do pedido nunca vira pago', () => {
    expect(decideMercadoPagoTransition(processing, state({ paidCents: 10499 }))).toEqual({
      kind: 'none',
      reason: 'amount_mismatch',
    })
  })

  it('Pix aguardando transferência é progresso', () => {
    expect(
      decideMercadoPagoTransition(
        processing,
        state({ status: 'action_required', statusDetail: 'waiting_transfer', payment: { methodId: 'pix', methodType: 'bank_transfer' } }),
      ),
    ).toEqual({ kind: 'progress' })
  })

  it('recusado, cancelado ou vencido → falhou', () => {
    for (const status of ['failed', 'canceled', 'expired']) {
      expect(decideMercadoPagoTransition(processing, state({ status, statusDetail: status }))).toEqual({ kind: 'failed' })
    }
  })

  it('"failed" atrasado não desfaz um pagamento', () => {
    expect(decideMercadoPagoTransition(paid, state({ status: 'failed', statusDetail: 'failed' }))).toEqual({
      kind: 'none',
      reason: 'unchanged',
    })
  })

  it('reaplicar "processed" num pago não muda nada', () => {
    expect(decideMercadoPagoTransition(paid, state())).toEqual({ kind: 'none', reason: 'unchanged' })
  })

  it('reembolso parcial e depois total', () => {
    const partial = decideMercadoPagoTransition(
      paid,
      state({ statusDetail: 'partially_refunded', refundedCents: 1000 }),
    )
    expect(partial).toEqual({ kind: 'refund', status: 'PARTIALLY_REFUNDED', refundedAmount: 1000 })

    const afterPartial: CurrentPayment = { status: 'PARTIALLY_REFUNDED', amount: 10500, refundedAmount: 1000 }
    expect(
      decideMercadoPagoTransition(afterPartial, state({ status: 'refunded', statusDetail: 'refunded', refundedCents: 10500 })),
    ).toEqual({ kind: 'refund', status: 'REFUNDED', refundedAmount: 10500 })
  })

  it('reembolso total vale o pedido inteiro mesmo sem a lista de reembolsos', () => {
    expect(
      decideMercadoPagoTransition(paid, state({ status: 'refunded', statusDetail: 'refunded', refundedCents: 0 })),
    ).toEqual({ kind: 'refund', status: 'REFUNDED', refundedAmount: 10500 })
  })

  it('o mesmo parcial reaplicado não gera segundo evento', () => {
    const afterPartial: CurrentPayment = { status: 'PARTIALLY_REFUNDED', amount: 10500, refundedAmount: 1000 }
    expect(
      decideMercadoPagoTransition(afterPartial, state({ statusDetail: 'partially_refunded', refundedCents: 1000 })),
    ).toEqual({ kind: 'none', reason: 'unchanged' })
  })

  it('FAILED e REFUNDED são finais', () => {
    expect(decideMercadoPagoTransition({ ...processing, status: 'FAILED' }, state()).kind).toBe('none')
    expect(decideMercadoPagoTransition({ ...paid, status: 'REFUNDED', refundedAmount: 10500 }, state()).kind).toBe('none')
  })

  it('reembolso de algo nunca visto como pago não decide nada', () => {
    expect(decideMercadoPagoTransition(processing, state({ status: 'refunded', statusDetail: 'refunded' }))).toEqual({
      kind: 'none',
      reason: 'refund_before_paid',
    })
  })

  it('chargeback não tem transição automática', () => {
    expect(decideMercadoPagoTransition(paid, state({ status: 'charged_back', statusDetail: 'in_process' }))).toEqual({
      kind: 'none',
      reason: 'chargeback',
    })
  })
})
