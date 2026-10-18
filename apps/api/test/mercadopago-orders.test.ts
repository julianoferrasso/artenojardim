import { describe, it, expect, vi, afterEach, afterAll } from 'vitest'

/**
 * O que sai para o MP na criação da cobrança, com o fetch interceptado. O device
 * ID tem de ir no header que o Orders API lê — e o header não pode existir sem
 * valor. Os itens levam a categoria no vocabulário do MP.
 */

vi.mock('../src/config/env.js', () => ({
  mercadoPagoConfig: { environment: 'test', accessToken: 'token-de-teste', publicKey: 'pk-de-teste' },
}))

vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}))

const approved = {
  id: 'ORDTST01TESTE',
  status: 'processed',
  status_detail: 'accredited',
  external_reference: 'pedido_1',
  total_amount: '91.42',
  total_paid_amount: '91.42',
  transactions: {
    payments: [
      {
        id: 'PAY01TESTE',
        status: 'processed',
        status_detail: 'accredited',
        payment_method: { id: 'master', type: 'credit_card', installments: 1 },
      },
    ],
  },
}

const fetchMock = vi.fn(
  async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(approved), { status: 201 }),
)
vi.stubGlobal('fetch', fetchMock)

const { createCardOrder } = await import('../src/integrations/mercadopago/orders.js')

const card = {
  externalReference: 'pedido_1',
  amountCents: 9142,
  description: 'Pedido #1 · Arte no Jardim',
  payer: { email: 'cliente@loja.test' },
  idempotencyKey: 'card-pedido_1-abc',
  token: 'tok_123',
  paymentMethodId: 'master',
  paymentType: 'credit_card',
  installments: 1,
} as const

const sentHeaders = () => fetchMock.mock.calls[0]![1]!.headers as Record<string, string>
const sentBody = () => JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)

afterEach(() => fetchMock.mockClear())
afterAll(() => vi.unstubAllGlobals())

describe('createCardOrder', () => {
  it('manda o device ID no header X-meli-session-id', async () => {
    await createCardOrder({ ...card, deviceId: 'armor.abc' })
    expect(sentHeaders()['X-meli-session-id']).toBe('armor.abc')
    expect(sentHeaders()['X-Idempotency-Key']).toBe('card-pedido_1-abc')
    expect(sentHeaders()['Authorization']).toBe('Bearer token-de-teste')
  })

  it('sem device ID, o header não existe', async () => {
    await createCardOrder(card)
    expect(sentHeaders()).not.toHaveProperty('X-meli-session-id')
  })

  it('leva categoria e descrição dos itens no formato do MP', async () => {
    await createCardOrder({
      ...card,
      items: [{ title: 'Vela (Padrão)', description: 'Vela', quantity: 1, unitPriceCents: 9142, categoryId: 'home' }],
    })
    expect(sentBody().items[0]).toEqual({
      title: 'Vela (Padrão)',
      description: 'Vela',
      quantity: 1,
      unit_price: '91.42',
      category_id: 'home',
    })
  })
})
