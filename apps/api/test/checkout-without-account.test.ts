import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * As duas portas do checkout de quem ainda não tem conta, do lado da API:
 *  - o resumo e o pedido recusam conta sem e-mail confirmado ANTES de cotar o
 *    frete (cota do Melhor Envio e segundos de espera);
 *  - o cupom é conferido sem cliente — o limite por pessoa fica para o confirm,
 *    que já conhece o cliente.
 */

let customerRow: Record<string, unknown> | null = null
const coupon = {
  id: 'cup_1',
  code: 'BEMVINDA',
  type: 'PERCENTAGE',
  value: 10,
  isActive: true,
  startsAt: null,
  endsAt: null,
  minOrderValue: null,
  usageLimit: null,
  usageCount: 0,
  usageLimitPerCustomer: 1,
}

const db = {
  customer: { findFirst: vi.fn(async () => customerRow) },
  coupon: { findUnique: vi.fn(async () => coupon) },
  order: { count: vi.fn(async () => 0) },
}
vi.mock('../src/config/prisma.js', () => ({ prisma: db }))
vi.mock('../src/shared/store-context.js', () => ({ getActiveStoreId: () => 'store_1' }))
vi.mock('../src/shared/audit.js', () => ({ audit: vi.fn(), diff: vi.fn() }))
vi.mock('../src/shared/settings.js', () => ({ getSetting: vi.fn() }))

const cart = {
  resolveCart: vi.fn(async () => ({ cartId: 'cart_1' })),
  getCart: vi.fn(async () => ({ items: [], subtotal: 0 })),
}
vi.mock('../src/modules/cart/service.js', () => cart)

const quoteShipping = vi.fn(async () => [])
vi.mock('../src/modules/shipping/service.js', () => ({ quoteShipping }))
vi.mock('../src/modules/addresses/service.js', () => ({ getAddress: vi.fn() }))
vi.mock('../src/modules/orders/service.js', () => ({ getOrder: vi.fn() }))
vi.mock('../src/modules/notifications/service.js', () => ({ notifyOrderCreated: vi.fn() }))
vi.mock('../src/modules/inventory/service.js', () => ({ afterStockChange: vi.fn() }))

const { getSummary } = await import('../src/modules/checkout/service.js')
const { resolveCoupon, validateCouponForCart } = await import('../src/modules/coupons/service.js')

const summaryReq = { addressId: 'addr_1', shippingServiceId: 'svc_1' }

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (e: { code?: string }) => e.code,
  )

beforeEach(() => {
  vi.clearAllMocks()
  customerRow = null
})

describe('checkout: e-mail confirmado é invariante do servidor', () => {
  it('conta não confirmada é recusada antes de cotar o frete', async () => {
    customerRow = { email: 'ana@loja.test', phone: null, document: null, emailVerifiedAt: null }
    expect(await codeOf(getSummary('cust_1', summaryReq))).toBe('EMAIL_NOT_VERIFIED')
    expect(quoteShipping).not.toHaveBeenCalled()
    expect(cart.resolveCart).not.toHaveBeenCalled()
  })

  it('conta apagada (ou de outra loja) não monta pedido', async () => {
    customerRow = null
    expect(await codeOf(getSummary('cust_1', summaryReq))).toBe('ACCOUNT_DISABLED')
    expect(db.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cust_1', storeId: 'store_1', deletedAt: null } }),
    )
  })

  it('conta confirmada passa da trava (e segue para o carrinho)', async () => {
    customerRow = { email: 'ana@loja.test', phone: null, document: null, emailVerifiedAt: new Date() }
    expect(await codeOf(getSummary('cust_1', summaryReq))).toBe('CART_EMPTY')
    expect(cart.resolveCart).toHaveBeenCalledWith({ customerId: 'cust_1' })
  })
})

describe('cupom sem conta', () => {
  it('sem cliente, o limite por pessoa não é contado aqui', async () => {
    await expect(resolveCoupon(null, 'BEMVINDA', 10_000)).resolves.toMatchObject({ id: 'cup_1' })
    expect(db.order.count).not.toHaveBeenCalled()
  })

  it('com cliente, o limite por pessoa conta como sempre', async () => {
    await resolveCoupon('cust_1', 'BEMVINDA', 10_000)
    expect(db.order.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: 'cust_1', couponId: 'cup_1' }) }),
    )
  })

  it('o visitante confere contra o carrinho da sessão do navegador', async () => {
    cart.getCart.mockResolvedValueOnce({ items: [], subtotal: 10_000 })
    await expect(validateCouponForCart({ sessionToken: 'sess_1' }, 'BEMVINDA')).resolves.toMatchObject({
      code: 'BEMVINDA',
      discountCents: 1_000,
    })
    expect(cart.resolveCart).toHaveBeenCalledWith({ sessionToken: 'sess_1' })
    expect(db.order.count).not.toHaveBeenCalled()
  })

  it('sem cookie de carrinho, nem cria carrinho: carrinho vazio', async () => {
    expect(await codeOf(validateCouponForCart(null, 'BEMVINDA'))).toBe('CART_EMPTY')
    expect(cart.resolveCart).not.toHaveBeenCalled()
  })
})
