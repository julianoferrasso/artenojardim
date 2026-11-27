import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ERROR_CODES } from '@ecommerce/shared/contracts'

/**
 * Classificação da resposta do /oauth/token. É ela que decide se a conexão é
 * apagada (refresh morto) ou mantida (credencial do app errada ou ausente, que
 * se corrige no admin). Errar aqui derruba o frete à toa — foi o risco de
 * 27/11/2026, com as credenciais recém-migradas do .env para o admin.
 */

let appConfig: { clientId: string | null; clientSecret: string | null }

vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}))

vi.mock('../src/integrations/melhor-envio/config.js', () => ({
  getMeAppConfig: vi.fn(async () => ({
    baseUrl: 'https://me.test',
    userAgent: 'teste',
    ...appConfig,
  })),
  meRedirectUri: () => 'https://loja.test/melhorenvio',
}))

const { refreshTokens, exchangeCodeForTokens } = await import('../src/integrations/melhor-envio/oauth.js')

const fetchMock = vi.fn()

const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }))

beforeEach(() => {
  appConfig = { clientId: '26048', clientSecret: 'segredo' }
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('refreshTokens', () => {
  it('sucesso devolve os tokens', async () => {
    respond(200, { token_type: 'Bearer', expires_in: 2_592_000, access_token: 'a', refresh_token: 'r' })

    await expect(refreshTokens('r-old')).resolves.toEqual({
      ok: true,
      tokens: { accessToken: 'a', refreshToken: 'r', expiresInSeconds: 2_592_000 },
    })
  })

  it('sem Client ID/Secret no admin: NOT_CONFIGURED, sem chamar o ME', async () => {
    appConfig = { clientId: null, clientSecret: null }

    await expect(refreshTokens('r-old')).resolves.toEqual({ ok: false, reason: 'NOT_CONFIGURED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('invalid_client (secret ou client id errado): CLIENT_REJECTED', async () => {
    respond(401, { error: 'invalid_client', error_description: 'Client authentication failed' })

    await expect(refreshTokens('r-old')).resolves.toEqual({ ok: false, reason: 'CLIENT_REJECTED' })
  })

  it.each([
    [400, { error: 'invalid_grant', error_description: 'The refresh token is invalid.' }],
    [401, { error: 'invalid_request', hint: 'Token has been revoked' }],
    [400, null],
  ])('refresh morto (%i): GRANT_REJECTED', async (status, body) => {
    respond(status, body)

    await expect(refreshTokens('r-old')).resolves.toEqual({ ok: false, reason: 'GRANT_REJECTED' })
  })

  it('5xx é transitório: exceção, não recusa', async () => {
    respond(502, { message: 'Bad Gateway' })

    await expect(refreshTokens('r-old')).rejects.toMatchObject({ code: ERROR_CODES.EXTERNAL_SERVICE_ERROR })
  })
})

describe('exchangeCodeForTokens', () => {
  it('código recusado vira erro de negócio', async () => {
    respond(400, { error: 'invalid_grant' })

    await expect(exchangeCodeForTokens('codigo')).rejects.toMatchObject({
      code: ERROR_CODES.SHIPPING_UNAVAILABLE,
      status: 400,
    })
  })

  it('sem credenciais no admin: 503 pedindo para preencher', async () => {
    appConfig = { clientId: '26048', clientSecret: null }

    await expect(exchangeCodeForTokens('codigo')).rejects.toMatchObject({
      code: ERROR_CODES.SHIPPING_UNAVAILABLE,
      status: 503,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
