import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

/**
 * Código de 6 dígitos por e-mail e o cadastro sem senha, com banco em memória.
 * O que se trava aqui é o que viraria brecha ou abandono:
 *  - o código é guardado como HMAC (não reversível por quem lê o banco);
 *  - a tentativa é gasta antes de comparar, e a 5ª errada mata o código;
 *  - conta só nasce com nome, e o código sobrevive ao NAME_REQUIRED;
 *  - confirmar conta antiga descarta a senha não provada (pré-sequestro);
 *  - o cadastro não grava senha e não "assume" conta já confirmada.
 */

type Row = Record<string, unknown>

/** Igualdade, `null` e `{ gt | lt }` — o que as queries do módulo usam. */
const matches = (row: Row, where: Record<string, unknown>): boolean =>
  Object.entries(where).every(([key, cond]) => {
    const value = row[key]
    if (cond === null) return value === null || value === undefined
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime()
    if (typeof cond === 'object' && cond !== undefined) {
      const c = cond as { gt?: number | Date; lt?: number | Date }
      if (c.gt !== undefined) return (value as number | Date) > c.gt
      if (c.lt !== undefined) return (value as number | Date) < c.lt
    }
    return value === cond
  })

const applyData = (row: Row, data: Record<string, unknown>): void => {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) {
      row[key] = (row[key] as number) + (value as { increment: number }).increment
    } else {
      row[key] = value
    }
  }
}

let codes: Row[] = []
let customers: Row[] = []
let seq = 0

const newestFirst = (rows: Row[]) =>
  [...rows].sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())

const db = {
  customerEmailCode: {
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { id: `code_${++seq}`, attempts: 0, usedAt: null, createdAt: new Date(), ...data }
      codes.push(row)
      return row
    }),
    findFirst: vi.fn(async ({ where }: { where: Row }) => newestFirst(codes.filter((r) => matches(r, where)))[0] ?? null),
    findFirstOrThrow: vi.fn(async ({ where }: { where: Row }) => {
      const row = codes.find((r) => matches(r, where))
      if (!row) throw new Error('not found')
      return row
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const hit = codes.filter((r) => matches(r, where))
      hit.forEach((r) => applyData(r, data))
      return { count: hit.length }
    }),
    deleteMany: vi.fn(async ({ where }: { where: Row }) => {
      const before = codes.length
      codes = codes.filter((r) => !matches(r, where))
      return { count: before - codes.length }
    }),
  },
  customer: {
    findUnique: vi.fn(async ({ where }: { where: { storeId_email: { storeId: string; email: string } } }) =>
      customers.find((c) => c.storeId === where.storeId_email.storeId && c.email === where.storeId_email.email) ?? null,
    ),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = customers.find((c) => c.id === where.id)
      if (!row) throw new Error('not found')
      return row
    }),
    findFirst: vi.fn(async ({ where }: { where: Row }) => {
      const row = customers.find((c) => matches(c, where))
      return row ? { ...row, _count: { orders: 0 } } : null
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = {
        id: `cust_${++seq}`,
        passwordHash: null,
        pendingName: null,
        pendingEmail: null,
        emailVerifiedAt: null,
        deletedAt: null,
        acceptsMarketing: false,
        phone: null,
        document: null,
        ...data,
      }
      customers.push(row)
      return row
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = customers.find((c) => c.id === where.id)!
      applyData(row, data)
      return row
    }),
  },
  customerToken: { updateMany: vi.fn(async () => ({ count: 1 })) },
  $transaction: async <T>(fn: (tx: typeof db) => Promise<T>) => fn(db),
}

vi.mock('../src/config/prisma.js', () => ({ prisma: db }))

vi.mock('../src/config/env.js', () => ({
  env: {
    JWT_CUSTOMER_ACCESS_SECRET: 'c'.repeat(32),
    ACCESS_TOKEN_TTL: '15m',
    EMAIL_VERIFICATION_TTL_HOURS: 24,
    PASSWORD_RESET_TTL_MINUTES: 30,
  },
  isProduction: false,
  isTest: true,
}))

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() }
vi.mock('../src/config/logger.js', () => ({ logger }))

vi.mock('../src/shared/store-context.js', () => ({ getActiveStoreId: () => 'store_1' }))

vi.mock('../src/shared/email-branding.js', () => ({
  getEmailBranding: async () => ({ storeName: 'Loja', storeUrl: 'https://loja.test', logoUrl: null }),
}))

const audit = vi.fn(async () => {})
vi.mock('../src/shared/audit.js', () => ({ audit: (...args: unknown[]) => audit(...(args as [])) }))

vi.mock('../src/shared/refresh-tokens.js', () => ({
  issueRefreshToken: vi.fn(async () => 'refresh_raw'),
  validateAndRotate: vi.fn(),
  revokeToken: vi.fn(),
  revokeAllSessions: vi.fn(),
}))

vi.mock('../src/modules/auth/domain/tokens.js', () => ({
  signAccessToken: vi.fn(async () => 'access_jwt'),
  ttlToSeconds: () => 900,
}))

const linkToken = { confirmDelivery: vi.fn(async () => {}) }
vi.mock('../src/modules/customer-auth/tokens.js', () => ({
  issueCustomerToken: vi.fn(async () => ({ token: 'link_token', confirmDelivery: linkToken.confirmDelivery })),
  findValidCustomerToken: vi.fn(async () => ({ id: 'tok_1', customerId: linkCustomerId })),
  consumeCustomerToken: vi.fn(async () => {}),
}))
let linkCustomerId = ''

type Sent = { to: string; subject: string; html: string; text: string }
let sent: Sent[] = []
let deliver = true
vi.mock('../src/integrations/email/index.js', async () => {
  const code = await vi.importActual<typeof import('../src/integrations/email/templates/email-code.js')>(
    '../src/integrations/email/templates/email-code.js',
  )
  const verify = await vi.importActual<typeof import('../src/integrations/email/templates/verify-email.js')>(
    '../src/integrations/email/templates/verify-email.js',
  )
  return {
    renderEmailCode: code.renderEmailCode,
    renderVerifyEmail: verify.renderVerifyEmail,
    renderResetPassword: () => ({ subject: 's', html: 'h', text: 't' }),
    sendEmailSafe: vi.fn(async (msg: Sent) => {
      sent.push(msg)
      return deliver
    }),
  }
})

const service = await import('../src/modules/customer-auth/service.js')
const { consumeEmailCode } = await import('../src/modules/customer-auth/email-codes.js')

const ctx = { ip: '10.0.0.1', userAgent: 'vitest' }
const EMAIL = 'ana@loja.test'

/** O código sai no começo do assunto ("482913 é o seu código — Loja"). */
const lastCode = (): string => {
  const match = /^(\d{6})/.exec(sent.at(-1)?.subject ?? '')
  if (!match) throw new Error('nenhum código enviado')
  return match[1]!
}

const wrongCodeFor = (code: string): string => (code === '000000' ? '111111' : '000000')

/** Empurra a espera do reenvio para o passado. */
const ageCodes = (ms: number) => {
  for (const row of codes) row.createdAt = new Date((row.createdAt as Date).getTime() - ms)
}

const expectAppError = async (promise: Promise<unknown>, code: string, status?: number) => {
  const err = (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as { code?: string; status?: number; message?: string } | null
  expect(err, `esperava ${code}`).not.toBeNull()
  expect(err!.code).toBe(code)
  if (status !== undefined) expect(err!.status).toBe(status)
  return err!
}

beforeEach(() => {
  vi.clearAllMocks()
  codes = []
  customers = []
  sent = []
  deliver = true
  seq = 0
  linkCustomerId = ''
})

describe('requestEmailCode', () => {
  it('manda o código no assunto e guarda só um HMAC dele', async () => {
    const result = await service.requestEmailCode(EMAIL, ctx)
    expect(result).toEqual({ email: EMAIL, resendInSeconds: 60 })

    const code = lastCode()
    expect(sent.at(-1)?.to).toBe(EMAIL)
    expect(sent.at(-1)?.text).toContain(`Seu código: ${code}`)

    const stored = codes[0]!.codeHash as string
    expect(stored).not.toContain(code)
    // SHA puro do código (com ou sem o e-mail) seria reversível em 1 milhão de tentativas.
    expect(stored).not.toBe(createHash('sha256').update(code).digest('hex'))
    expect(stored).not.toBe(createHash('sha256').update(`store_1:${EMAIL}:${code}`).digest('hex'))
  })

  it('não consulta cliente nenhum: a resposta é a mesma para quem tem e quem não tem conta', async () => {
    await service.requestEmailCode(EMAIL, ctx)
    expect(db.customer.findUnique).not.toHaveBeenCalled()
    expect(db.customer.findFirst).not.toHaveBeenCalled()
  })

  it('recusa outro pedido antes de 60 s, dizendo quanto falta', async () => {
    await service.requestEmailCode(EMAIL, ctx)
    const err = (await expectAppError(service.requestEmailCode(EMAIL, ctx), 'EMAIL_CODE_RESEND_TOO_SOON', 429)) as {
      details?: Array<{ field: string; message: string }>
    }
    const wait = Number(err.details?.find((d) => d.field === 'resendInSeconds')?.message)
    expect(wait).toBeGreaterThan(55)
    expect(wait).toBeLessThanOrEqual(60)
  })

  it('envio que falhou apaga o código e não prende a espera do reenvio', async () => {
    deliver = false
    await expectAppError(service.requestEmailCode(EMAIL, ctx), 'EXTERNAL_SERVICE_ERROR', 503)
    expect(codes).toHaveLength(0)

    deliver = true
    await expect(service.requestEmailCode(EMAIL, ctx)).resolves.toMatchObject({ resendInSeconds: 60 })
  })

  it('o código novo aposenta os anteriores depois de entregue', async () => {
    await service.requestEmailCode(EMAIL, ctx)
    ageCodes(61_000)
    await service.requestEmailCode(EMAIL, ctx)

    const [older, newer] = [...codes].sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime())
    expect(older!.usedAt).toBeInstanceOf(Date)
    expect(newer!.usedAt).toBeNull()
  })

  it('o código nunca chega ao log', async () => {
    deliver = false
    await service.requestEmailCode(EMAIL, ctx).catch(() => {})
    deliver = true
    await service.requestEmailCode(EMAIL, ctx)
    const code = lastCode()
    const logged = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls])
    expect(logged).not.toContain(code)
  })
})

describe('verifyEmailCode', () => {
  it('sem código pedido: venceu', async () => {
    await expectAppError(service.verifyEmailCode({ email: EMAIL, code: '123456' }, ctx), 'EMAIL_CODE_EXPIRED')
  })

  it('gasta a tentativa ANTES de comparar e diz quantas restam', async () => {
    await service.requestEmailCode(EMAIL, ctx)
    const err = await expectAppError(
      service.verifyEmailCode({ email: EMAIL, code: wrongCodeFor(lastCode()), name: 'Ana' }, ctx),
      'EMAIL_CODE_INVALID',
    )
    expect(err.message).toContain('Restam 4 tentativas')
    expect(codes[0]!.attempts).toBe(1)
  })

  it('a 5ª tentativa errada mata o código — nem o certo vale depois', async () => {
    await service.requestEmailCode(EMAIL, ctx)
    const code = lastCode()
    for (let i = 0; i < 4; i++) {
      await expectAppError(service.verifyEmailCode({ email: EMAIL, code: wrongCodeFor(code) }, ctx), 'EMAIL_CODE_INVALID')
    }
    await expectAppError(service.verifyEmailCode({ email: EMAIL, code: wrongCodeFor(code) }, ctx), 'EMAIL_CODE_EXPIRED')
    await expectAppError(service.verifyEmailCode({ email: EMAIL, code, name: 'Ana' }, ctx), 'EMAIL_CODE_EXPIRED')
  })

  it('código vencido não vale', async () => {
    await service.requestEmailCode(EMAIL, ctx)
    codes[0]!.expiresAt = new Date(Date.now() - 1000)
    await expectAppError(service.verifyEmailCode({ email: EMAIL, code: lastCode(), name: 'Ana' }, ctx), 'EMAIL_CODE_EXPIRED')
  })

  it('e-mail novo sem nome: NAME_REQUIRED e o MESMO código segue valendo', async () => {
    await service.requestEmailCode(EMAIL, ctx)
    const code = lastCode()

    await expectAppError(service.verifyEmailCode({ email: EMAIL, code }, ctx), 'NAME_REQUIRED', 422)
    expect(codes[0]!.usedAt).toBeNull()
    expect(customers).toHaveLength(0)

    const session = await service.verifyEmailCode({ email: EMAIL, code, name: 'Ana Souza' }, ctx)
    expect(session.customer).toMatchObject({ email: EMAIL, name: 'Ana Souza', emailVerified: true, hasPassword: false })
    expect(session.accessToken).toBe('access_jwt')
    expect(session.refreshToken).toBe('refresh_raw')
    expect(customers[0]).toMatchObject({ passwordHash: null })
    expect(customers[0]!.emailVerifiedAt).toBeInstanceOf(Date)
    expect(codes[0]!.usedAt).toBeInstanceOf(Date)
  })

  it('código usado não entra de novo', async () => {
    await service.requestEmailCode(EMAIL, ctx)
    const code = lastCode()
    await service.verifyEmailCode({ email: EMAIL, code, name: 'Ana' }, ctx)
    await expectAppError(service.verifyEmailCode({ email: EMAIL, code }, ctx), 'EMAIL_CODE_EXPIRED')
  })

  it('conta antiga não confirmada: confirma e DESCARTA senha e nome pendente não provados', async () => {
    customers.push({
      id: 'cust_old',
      storeId: 'store_1',
      email: EMAIL,
      name: 'Quem cadastrou',
      passwordHash: 'hash-de-quem-cadastrou',
      pendingName: 'Outro nome',
      pendingEmail: null,
      emailVerifiedAt: null,
      deletedAt: null,
      acceptsMarketing: false,
      phone: null,
      document: null,
    })
    await service.requestEmailCode(EMAIL, ctx)
    const session = await service.verifyEmailCode({ email: EMAIL, code: lastCode(), name: 'Dona da Caixa' }, ctx)

    expect(customers[0]).toMatchObject({ passwordHash: null, pendingName: null, name: 'Dona da Caixa' })
    expect(customers[0]!.emailVerifiedAt).toBeInstanceOf(Date)
    expect(session.customer.hasPassword).toBe(false)
    // O link do cadastro deixa de valer.
    expect(db.customerToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: 'cust_old', purpose: 'EMAIL_VERIFICATION' }) }),
    )
  })

  it('conta confirmada: só entra — senha e nome intactos', async () => {
    const verifiedAt = new Date('2026-01-01T00:00:00Z')
    customers.push({
      id: 'cust_ok',
      storeId: 'store_1',
      email: EMAIL,
      name: 'Ana',
      passwordHash: 'hash',
      pendingName: null,
      pendingEmail: null,
      emailVerifiedAt: verifiedAt,
      deletedAt: null,
      acceptsMarketing: true,
      phone: null,
      document: null,
    })
    await service.requestEmailCode(EMAIL, ctx)
    const session = await service.verifyEmailCode({ email: EMAIL, code: lastCode(), name: 'Outro' }, ctx)

    expect(customers[0]).toMatchObject({ passwordHash: 'hash', name: 'Ana', emailVerifiedAt: verifiedAt })
    expect(customers[0]!.lastLoginAt).toBeInstanceOf(Date)
    expect(session.customer.hasPassword).toBe(true)
    expect(audit).not.toHaveBeenCalled()
  })

  it('conta apagada não entra', async () => {
    customers.push({ id: 'cust_del', storeId: 'store_1', email: EMAIL, name: 'X', deletedAt: new Date(), emailVerifiedAt: new Date() })
    await service.requestEmailCode(EMAIL, ctx)
    await expectAppError(service.verifyEmailCode({ email: EMAIL, code: lastCode() }, ctx), 'ACCOUNT_DISABLED', 403)
  })

  it('o consumo perdido numa corrida responde "venceu"', async () => {
    await service.requestEmailCode(EMAIL, ctx)
    codes[0]!.usedAt = new Date()
    await expectAppError(consumeEmailCode(db as never, codes[0]!.id as string), 'EMAIL_CODE_EXPIRED')
  })
})

describe('registerCustomer', () => {
  it('não grava senha e manda código + link com o next', async () => {
    const result = await service.registerCustomer(
      { name: 'Ana', email: EMAIL, acceptsMarketing: true, next: '/checkout' },
      ctx,
    )
    expect(result).toEqual({ email: EMAIL, resendInSeconds: 60 })
    expect(customers[0]).toMatchObject({ email: EMAIL, name: 'Ana', passwordHash: null, emailVerifiedAt: null })

    const mail = sent.at(-1)!
    expect(mail.subject).toMatch(/^\d{6} — confirme o seu e-mail/)
    expect(mail.text).toContain('https://loja.test/entrar/verificar-email?token=link_token&next=%2Fcheckout')
    expect(codes).toHaveLength(1)
  })

  it('recusa conta já confirmada mesmo sem senha — "assumir" seria tomar a conta', async () => {
    customers.push({
      id: 'cust_code',
      storeId: 'store_1',
      email: EMAIL,
      name: 'Ana',
      passwordHash: null,
      emailVerifiedAt: new Date(),
      deletedAt: null,
    })
    await expectAppError(
      service.registerCustomer({ name: 'Intruso', email: EMAIL, acceptsMarketing: false }, ctx),
      'EMAIL_ALREADY_EXISTS',
      409,
    )
    expect(db.customer.update).not.toHaveBeenCalled()
  })

  it('o código do cadastro confirma e entra', async () => {
    await service.registerCustomer({ name: 'Ana', email: EMAIL, acceptsMarketing: true }, ctx)
    const code = /^(\d{6})/.exec(sent.at(-1)!.subject)![1]!
    const session = await service.verifyEmailCode({ email: EMAIL, code, name: 'Ana' }, ctx)
    expect(session.customer).toMatchObject({ emailVerified: true, name: 'Ana', hasPassword: false })
  })
})

describe('verifyCustomerEmail (o link)', () => {
  it('confirma, entra e descarta senha anterior à confirmação', async () => {
    customers.push({
      id: 'cust_link',
      storeId: 'store_1',
      email: EMAIL,
      name: 'Ana',
      passwordHash: 'hash-antigo',
      pendingName: null,
      pendingEmail: null,
      emailVerifiedAt: null,
      deletedAt: null,
      acceptsMarketing: false,
      phone: null,
      document: null,
    })
    linkCustomerId = 'cust_link'

    const session = await service.verifyCustomerEmail('link_token', ctx)
    expect(session.accessToken).toBe('access_jwt')
    expect(customers[0]).toMatchObject({ passwordHash: null })
    expect(customers[0]!.emailVerifiedAt).toBeInstanceOf(Date)
    expect(customers[0]!.lastLoginAt).toBeInstanceOf(Date)
  })
})
