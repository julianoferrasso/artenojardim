import { describe, it, expect, vi, afterEach } from 'vitest'

/**
 * A chave MP_ENVIRONMENT com o env.ts de verdade: ele valida no import, então
 * cada caso reimporta o módulo com outro process.env. O que trava aqui é o que
 * custaria dinheiro: pagador de teste em produção, e produção caindo em teste.
 */

const REQUIRED = {
  API_URL: 'https://api.test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  STORE_ID: 'store_1',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  JWT_CUSTOMER_ACCESS_SECRET: 'c'.repeat(32),
  JWT_CUSTOMER_REFRESH_SECRET: 'd'.repeat(32),
  STORE_URL: 'https://loja.test',
  ADMIN_URL: 'https://admin.test',
}

/** O mínimo que NODE_ENV=production exige além do MP. */
const PRODUCTION = {
  NODE_ENV: 'production',
  AWS_ACCESS_KEY_ID: 'key',
  AWS_SECRET_ACCESS_KEY: 'secret',
  EMAIL_FROM: 'noreply@loja.test',
  RABBITMQ_URL: 'amqp://u:p@localhost:5672/vhost',
  EMAIL_UNSUBSCRIBE_SECRET: 'e'.repeat(32),
}

const BOTH_PAIRS = {
  MP_PUBLIC_KEY: 'pk-prod',
  MP_ACCESS_TOKEN: 'at-prod',
  MP_WEBHOOK_SECRET: 'wh-prod',
  MP_PUBLIC_KEY_TEST: 'pk-test',
  MP_ACCESS_TOKEN_TEST: 'at-test',
  MP_WEBHOOK_SECRET_TEST: 'wh-test',
  MP_TEST_PAYER_EMAIL: 'test@testuser.com',
}

const loadEnv = async (vars: Record<string, string>) => {
  vi.resetModules()
  for (const [key, value] of Object.entries({ ...REQUIRED, ...vars })) vi.stubEnv(key, value)
  return import('../src/config/env.js')
}

/** O env.ts encerra o processo quando a validação falha; aqui isso vira exceção. */
const captureBootFailure = () => {
  const errors: string[] = []
  vi.spyOn(console, 'error').mockImplementation((msg: string) => void errors.push(msg))
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`exit ${String(code)}`)
  })
  return errors
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('MP_ENVIRONMENT', () => {
  it('production usa o par sem sufixo e ignora o pagador de teste', async () => {
    const { mercadoPagoConfig } = await loadEnv({ ...BOTH_PAIRS, MP_ENVIRONMENT: 'production' })
    expect(mercadoPagoConfig).toEqual({
      environment: 'production',
      publicKey: 'pk-prod',
      accessToken: 'at-prod',
      webhookSecret: 'wh-prod',
      testPayerEmail: undefined,
    })
  })

  it('test usa o par _TEST e o pagador de teste', async () => {
    const { mercadoPagoConfig } = await loadEnv({ ...BOTH_PAIRS, MP_ENVIRONMENT: 'test' })
    expect(mercadoPagoConfig).toEqual({
      environment: 'test',
      publicKey: 'pk-test',
      accessToken: 'at-test',
      webhookSecret: 'wh-test',
      testPayerEmail: 'test@testuser.com',
    })
  })

  it('fora de produção, ausente vale test', async () => {
    const { mercadoPagoConfig } = await loadEnv(BOTH_PAIRS)
    expect(mercadoPagoConfig.environment).toBe('test')
    expect(mercadoPagoConfig.accessToken).toBe('at-test')
  })

  it('em produção, ausente derruba o boot', async () => {
    const errors = captureBootFailure()
    await expect(loadEnv({ ...PRODUCTION, ...BOTH_PAIRS })).rejects.toThrow('exit 1')
    expect(errors.join('\n')).toContain('MP_ENVIRONMENT é obrigatório em produção')
  })

  it('em produção, escolhido explicitamente, sobe', async () => {
    const { mercadoPagoConfig } = await loadEnv({ ...PRODUCTION, ...BOTH_PAIRS, MP_ENVIRONMENT: 'production' })
    expect(mercadoPagoConfig.environment).toBe('production')
  })

  it('par pela metade no ambiente ativo derruba o boot', async () => {
    const errors = captureBootFailure()
    await expect(loadEnv({ MP_ENVIRONMENT: 'production', MP_PUBLIC_KEY: 'pk-prod' })).rejects.toThrow('exit 1')
    expect(errors.join('\n')).toContain('MP_ACCESS_TOKEN é obrigatório com MP_ENVIRONMENT=production')
  })

  it('par pela metade no ambiente inativo não atrapalha', async () => {
    const { mercadoPagoConfig } = await loadEnv({
      MP_ENVIRONMENT: 'test',
      MP_PUBLIC_KEY: 'pk-prod',
      MP_PUBLIC_KEY_TEST: 'pk-test',
      MP_ACCESS_TOKEN_TEST: 'at-test',
    })
    expect(mercadoPagoConfig.accessToken).toBe('at-test')
  })
})
