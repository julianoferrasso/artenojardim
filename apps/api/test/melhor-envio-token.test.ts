import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { appError, externalServiceError } from '../src/shared/errors.js'

/**
 * Renovação do token do Melhor Envio.
 *
 * Nasceu do incidente de out/2026: o token só renovava quando uma cotação
 * chegava perto do vencimento, a loja ficou semanas sem cotar, o refresh token
 * venceu junto e o frete caiu sem ninguém ver. Aqui se exercita a máquina de
 * estados — margem, single-flight, recusa definitiva vs. falha transitória — com
 * o banco (settings) e o HTTP (oauth) mockados.
 */

type OAuthSetting = {
  state: string | null
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null
}

let stored: OAuthSetting

vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}))

vi.mock('../src/shared/settings.js', () => ({
  getSetting: vi.fn(async () => ({ ...stored })),
  setSetting: vi.fn(async (_key: string, value: OAuthSetting) => {
    stored = { ...value }
  }),
}))

const refreshTokens = vi.fn()

vi.mock('../src/integrations/melhor-envio/oauth.js', () => ({
  refreshTokens: (token: string) => refreshTokens(token),
  exchangeCodeForTokens: vi.fn(),
}))

const { getValidAccessToken, getConnectionStatus } = await import(
  '../src/integrations/melhor-envio/token.js'
)

const DAY_MS = 24 * 60 * 60_000
const rejected = () =>
  appError(ERROR_CODES.SHIPPING_UNAVAILABLE, 'Não foi possível autenticar no Melhor Envio.', 400)

beforeEach(() => {
  refreshTokens.mockReset()
  stored = {
    state: null,
    accessToken: 'access-old',
    refreshToken: 'refresh-old',
    expiresAt: Date.now() + 20 * DAY_MS,
  }
})

describe('getValidAccessToken', () => {
  it('devolve o token atual quando ainda vale além da margem', async () => {
    await expect(getValidAccessToken()).resolves.toBe('access-old')
    expect(refreshTokens).not.toHaveBeenCalled()
  })

  it('com margem de dias (o job), renova antes do vencimento', async () => {
    stored.expiresAt = Date.now() + 5 * DAY_MS
    refreshTokens.mockResolvedValue({
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
      expiresInSeconds: 30 * 24 * 60 * 60,
    })

    await expect(getValidAccessToken(7 * DAY_MS)).resolves.toBe('access-new')
    expect(refreshTokens).toHaveBeenCalledWith('refresh-old')
    expect(stored.refreshToken).toBe('refresh-new')
    expect(stored.expiresAt).toBeGreaterThan(Date.now() + 29 * DAY_MS)
  })

  it('chamadas simultâneas gastam o refresh token UMA vez (ele rotaciona)', async () => {
    stored.expiresAt = Date.now() - 1
    refreshTokens.mockResolvedValue({
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
      expiresInSeconds: 2_592_000,
    })

    const results = await Promise.all([getValidAccessToken(), getValidAccessToken()])

    expect(results).toEqual(['access-new', 'access-new'])
    expect(refreshTokens).toHaveBeenCalledTimes(1)
  })

  it('refresh recusado zera os tokens (preservando o state) e falha com 503', async () => {
    stored = { ...stored, state: 'reconexao-em-curso', expiresAt: Date.now() - 1 }
    refreshTokens.mockRejectedValue(rejected())

    await expect(getValidAccessToken()).rejects.toMatchObject({
      code: ERROR_CODES.SHIPPING_UNAVAILABLE,
      status: 503,
    })
    expect(stored).toEqual({
      state: 'reconexao-em-curso',
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    })
    await expect(getConnectionStatus()).resolves.toEqual({ connected: false, expiresAt: null })
  })

  it('refresh recusado porque OUTRO processo já renovou: usa o token dele, não zera', async () => {
    stored.expiresAt = Date.now() - 1
    refreshTokens.mockImplementation(async () => {
      // A API de dev (mesmo banco) renovou primeiro; o nosso refresh virou inválido.
      stored = {
        state: null,
        accessToken: 'access-other',
        refreshToken: 'refresh-other',
        expiresAt: Date.now() + 30 * DAY_MS,
      }
      throw rejected()
    })

    await expect(getValidAccessToken()).resolves.toBe('access-other')
    expect(stored.refreshToken).toBe('refresh-other')
  })

  it('falha transitória (5xx/rede) mantém os tokens para tentar de novo', async () => {
    stored.expiresAt = Date.now() - 1
    refreshTokens.mockRejectedValue(externalServiceError('Melhor Envio', new Error('HTTP 502')))

    await expect(getValidAccessToken()).rejects.toMatchObject({
      code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
    })
    expect(stored.refreshToken).toBe('refresh-old')
  })

  it('sem conta conectada, falha com 503 sem chamar o ME', async () => {
    stored = { state: null, accessToken: null, refreshToken: null, expiresAt: null }

    await expect(getValidAccessToken()).rejects.toMatchObject({ status: 503 })
    expect(refreshTokens).not.toHaveBeenCalled()
  })
})
