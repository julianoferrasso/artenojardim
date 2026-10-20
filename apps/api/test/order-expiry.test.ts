import { describe, it, expect } from 'vitest'
import {
  decideExpiry,
  EXPIRY_GRACE_MS,
  EXPIRY_NOTIFY_WINDOW_MS,
  type ExpiryAttempt,
} from '../src/modules/orders/domain/expiry.js'

/**
 * Quando o job cancela um pedido não pago. O erro caro é cancelar o que ainda
 * vai ser pago (venda perdida + estorno); o barato é esperar mais uma rodada.
 */

const now = new Date('2026-10-20T15:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms)
const MIN = 60_000

const pix = (over: Partial<ExpiryAttempt> = {}): ExpiryAttempt => ({
  provider: 'MERCADO_PAGO',
  method: 'PIX',
  status: 'PROCESSING',
  expiresAt: ago(20 * MIN),
  ...over,
})

const decide = (p: { paymentStatus?: 'PENDING' | 'PAID'; expiredFor?: number; attempts?: ExpiryAttempt[] }) =>
  decideExpiry({
    paymentStatus: p.paymentStatus ?? 'PENDING',
    latestReservationExpiry: ago(p.expiredFor ?? 30 * MIN),
    attempts: p.attempts ?? [],
    now,
  })

describe('decideExpiry', () => {
  it('sem tentativa de pagamento e reserva vencida além da carência → cancela e avisa', () => {
    expect(decide({})).toEqual({ action: 'cancel', notifyCustomer: true })
  })

  it('dentro da carência → espera (pagamento pode estar a caminho)', () => {
    expect(decide({ expiredFor: EXPIRY_GRACE_MS - 1 })).toEqual({ action: 'skip', reason: 'IN_GRACE' })
    expect(decide({ expiredFor: EXPIRY_GRACE_MS })).toMatchObject({ action: 'cancel' })
  })

  it('pedido já pago nunca é cancelado pelo job', () => {
    expect(decide({ paymentStatus: 'PAID' })).toEqual({ action: 'skip', reason: 'NOT_PENDING' })
  })

  it('Pix vencido ainda PROCESSING → cancela (o cancelamento derruba a cobrança no MP)', () => {
    expect(decide({ attempts: [pix()] })).toMatchObject({ action: 'cancel' })
  })

  it('Pix ainda dentro do vencimento → espera', () => {
    expect(decide({ attempts: [pix({ expiresAt: new Date(now.getTime() + MIN) })] })).toEqual({
      action: 'skip',
      reason: 'PIX_OPEN',
    })
  })

  it('Pix sem vencimento conhecido → espera (na dúvida, não cancela)', () => {
    expect(decide({ attempts: [pix({ expiresAt: null })] })).toEqual({ action: 'skip', reason: 'PIX_OPEN' })
  })

  it('cartão em análise → espera o MP decidir', () => {
    const card = pix({ method: 'CARD', expiresAt: null })
    expect(decide({ attempts: [card] })).toEqual({ action: 'skip', reason: 'PAYMENT_IN_REVIEW' })
  })

  it('tentativa Stripe em aberto → espera (o webhook dele não estorna pago-após-cancelar)', () => {
    const stripe = pix({ provider: 'STRIPE', method: 'CARD', expiresAt: null })
    expect(decide({ attempts: [stripe] })).toEqual({ action: 'skip', reason: 'STRIPE_OPEN' })
  })

  it('tentativas encerradas (recusada, vencida) não seguram o pedido', () => {
    const failedCard = pix({ method: 'CARD', status: 'FAILED', expiresAt: null })
    const failedPix = pix({ status: 'FAILED' })
    expect(decide({ attempts: [failedCard, failedPix] })).toMatchObject({ action: 'cancel' })
  })

  it('vencido há mais de 24h → cancela sem e-mail (pedido esquecido)', () => {
    expect(decide({ expiredFor: EXPIRY_NOTIFY_WINDOW_MS + MIN })).toEqual({
      action: 'cancel',
      notifyCustomer: false,
    })
  })
})
