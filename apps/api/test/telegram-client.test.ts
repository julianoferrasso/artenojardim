import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O cliente do Telegram com o fetch interceptado. O token vai DENTRO da URL, e o
 * logger só mascara campos pelo nome: o que se garante aqui é que nenhuma falha
 * carrega a URL (nem o token) na mensagem ou no `cause` — e que cada recusa é
 * classificada do jeito que a entrega de alertas precisa.
 */

const TOKEN = '123456789:AAEexemploDeTokenSecretoQueNaoPodeVazar_x'

vi.mock('../src/config/env.js', () => ({
  env: { TELEGRAM_BOT_TOKEN: TOKEN },
  isTelegramConfigured: () => true,
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { sendTelegramMessage, getTelegramUpdates, telegramFailureOf, classifyTelegramFailure } = await import(
  '../src/integrations/telegram/index.js'
)

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

beforeEach(() => fetchMock.mockReset())

const captureError = async (p: Promise<unknown>): Promise<unknown> => {
  try {
    await p
  } catch (err) {
    return err
  }
  throw new Error('esperava falha')
}

const leaksToken = (err: unknown): boolean =>
  JSON.stringify({ message: (err as Error).message, cause: (err as { cause?: unknown }).cause }).includes(TOKEN.split(':')[1]!)

describe('sendTelegramMessage', () => {
  it('manda HTML, sem preview de link, para o chat', async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true, result: { message_id: 1 } }))
    await sendTelegramMessage({ chatId: '-100123', html: '<b>oi</b>' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`)
    expect(JSON.parse(init.body as string)).toEqual({
      chat_id: '-100123',
      text: '<b>oi</b>',
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    })
  })

  it('bot bloqueado (403) = inalcançável, sem vazar o token', async () => {
    fetchMock.mockResolvedValue(reply(403, { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }))
    const err = await captureError(sendTelegramMessage({ chatId: '1', html: 'x' }))
    const failure = telegramFailureOf(err)

    expect(failure).toMatchObject({ provider: 'telegram', method: 'sendMessage', status: 403 })
    expect(classifyTelegramFailure(failure!)).toBe('unreachable')
    expect(leaksToken(err)).toBe(false)
  })

  it('chat inexistente (400 chat not found) também é inalcançável; outro 400 é recusa da mensagem', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { ok: false, description: 'Bad Request: chat not found' }))
    const notFound = telegramFailureOf(await captureError(sendTelegramMessage({ chatId: '1', html: 'x' })))
    expect(classifyTelegramFailure(notFound!)).toBe('unreachable')

    fetchMock.mockResolvedValueOnce(reply(400, { ok: false, description: "Bad Request: can't parse entities" }))
    const badHtml = telegramFailureOf(await captureError(sendTelegramMessage({ chatId: '1', html: 'x' })))
    expect(classifyTelegramFailure(badHtml!)).toBe('rejected')
  })

  it('429 traz o retry_after e é transitório', async () => {
    fetchMock.mockResolvedValue(reply(429, { ok: false, description: 'Too Many Requests', parameters: { retry_after: 7 } }))
    const failure = telegramFailureOf(await captureError(sendTelegramMessage({ chatId: '1', html: 'x' })))
    expect(failure?.retryAfter).toBe(7)
    expect(classifyTelegramFailure(failure!)).toBe('transient')
  })

  it('grupo que virou supergrupo devolve o chat_id novo', async () => {
    fetchMock.mockResolvedValue(
      reply(400, { ok: false, description: 'Bad Request: group chat was upgraded to a supergroup chat', parameters: { migrate_to_chat_id: -1009876 } }),
    )
    const failure = telegramFailureOf(await captureError(sendTelegramMessage({ chatId: '-55', html: 'x' })))
    expect(failure?.migrateToChatId).toBe('-1009876')
    expect(classifyTelegramFailure(failure!)).toBe('migrated')
  })

  it('token revogado (401) é problema do servidor, não do chat', async () => {
    fetchMock.mockResolvedValue(reply(401, { ok: false, description: 'Unauthorized' }))
    const failure = telegramFailureOf(await captureError(sendTelegramMessage({ chatId: '1', html: 'x' })))
    expect(classifyTelegramFailure(failure!)).toBe('bad_token')
  })

  it('falha de rede não carrega a mensagem do fetch (que pode ter a URL)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError(`fetch failed: https://api.telegram.org/bot${TOKEN}/sendMessage`))
    const err = await captureError(sendTelegramMessage({ chatId: '1', html: 'x' }))
    expect(telegramFailureOf(err)).toMatchObject({ status: 0, description: 'falha de rede' })
    expect(leaksToken(err)).toBe(false)
  })
})

describe('getTelegramUpdates', () => {
  it('pede só mensagens, com offset e long-poll, e normaliza o chat', async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        ok: true,
        result: [
          { update_id: 10, message: { text: '/start abc', chat: { id: -100555, type: 'supergroup', title: 'Equipe' } } },
          { update_id: 11, edited_message: {} },
        ],
      }),
    )

    const updates = await getTelegramUpdates({ offset: 9, timeoutSec: 10 })

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body).toEqual({ offset: 9, timeout: 10, allowed_updates: ['message'] })
    expect(updates).toEqual([
      {
        updateId: 10,
        chat: { id: '-100555', type: 'supergroup', title: 'Equipe', username: null, firstName: null },
        text: '/start abc',
      },
      { updateId: 11, chat: null, text: null },
    ])
  })
})
