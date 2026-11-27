import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Conta que nasceu pelo código do e-mail não tem senha. O que se trava aqui:
 *  - a PRIMEIRA senha entra só com a sessão (sem "senha atual"), e não
 *    sobrescreve uma senha criada no meio do caminho por outra aba;
 *  - quem já tem senha continua tendo de prová-la;
 *  - trocar e-mail e excluir a conta, que exigem a senha atual, respondem
 *    PASSWORD_NOT_SET — e não "sessão inválida", que deslogaria o cliente.
 */

let customerRow: { id: string; name: string; email: string; passwordHash: string | null } | null
const updateMany = vi.fn(async (_args: unknown) => ({ count: 1 }))

const db = {
  customer: {
    findFirst: vi.fn(async () => customerRow),
    updateMany: (args: unknown) => updateMany(args),
  },
  customerToken: { updateMany: vi.fn(async () => ({ count: 0 })) },
  $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
}
vi.mock('../src/config/prisma.js', () => ({ prisma: db }))
vi.mock('../src/config/env.js', () => ({ env: { EMAIL_VERIFICATION_TTL_HOURS: 24 }, isProduction: false }))
vi.mock('../src/config/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../src/shared/store-context.js', () => ({ getActiveStoreId: () => 'store_1' }))

const audit = vi.fn(async (_args: unknown) => {})
vi.mock('../src/shared/audit.js', () => ({ audit: (args: unknown) => audit(args) }))
vi.mock('../src/shared/email-branding.js', () => ({ getEmailBranding: vi.fn() }))
vi.mock('../src/shared/anonymize-customer.js', () => ({ anonymizeCustomerData: vi.fn() }))
vi.mock('../src/shared/refresh-tokens.js', () => ({ revokeAllSessions: vi.fn() }))
vi.mock('../src/integrations/email/index.js', () => ({
  renderConfirmEmailChange: vi.fn(),
  renderEmailChangeNotice: vi.fn(),
  sendEmailSafe: vi.fn(),
}))
vi.mock('../src/modules/customer-auth/tokens.js', () => ({
  consumeCustomerToken: vi.fn(),
  findValidCustomerToken: vi.fn(),
  issueCustomerToken: vi.fn(),
}))
const session = { customer: { id: 'cust_1' }, accessToken: 'a', expiresIn: 900, refreshToken: 'r' }
vi.mock('../src/modules/customer-auth/service.js', () => ({ issueCustomerSession: vi.fn(async () => session) }))

const { changeCustomerPassword, requestEmailChange, deleteOwnAccount } = await import(
  '../src/modules/customer-profile/credentials.js'
)

const ctx = { ip: '10.0.0.1', userAgent: 'vitest' }

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (e: { code?: string }) => e.code,
  )

beforeEach(() => {
  vi.clearAllMocks()
  customerRow = { id: 'cust_1', name: 'Ana', email: 'ana@loja.test', passwordHash: null }
})

describe('primeira senha', () => {
  it('entra sem a senha atual e não sobrescreve uma criada por outra aba', async () => {
    await expect(changeCustomerPassword('cust_1', { password: 'nova-senha' }, ctx)).resolves.toBe(session)

    const where = (updateMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where
    expect(where).toMatchObject({ id: 'cust_1', storeId: 'store_1', passwordHash: null })
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'customer.password_created' }))
  })

  it('se outra aba criou a senha no meio do caminho, recusa em vez de trocar sem provar', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 })
    expect(await codeOf(changeCustomerPassword('cust_1', { password: 'nova-senha' }, ctx))).toBe('CONFLICT')
  })

  it('quem já tem senha precisa informar a atual', async () => {
    customerRow = { ...customerRow!, passwordHash: 'hash' }
    expect(await codeOf(changeCustomerPassword('cust_1', { password: 'nova-senha' }, ctx))).toBe('VALIDATION_ERROR')
    expect(updateMany).not.toHaveBeenCalled()
  })
})

describe('ações que exigem a senha atual, numa conta sem senha', () => {
  it('trocar o e-mail responde PASSWORD_NOT_SET', async () => {
    expect(
      await codeOf(requestEmailChange('cust_1', { email: 'novo@loja.test', currentPassword: 'x' }, ctx)),
    ).toBe('PASSWORD_NOT_SET')
  })

  it('excluir a conta responde PASSWORD_NOT_SET', async () => {
    expect(await codeOf(deleteOwnAccount('cust_1', { currentPassword: 'x' }, ctx))).toBe('PASSWORD_NOT_SET')
  })
})
