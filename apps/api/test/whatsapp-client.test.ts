import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O que sai para a Meta. O template de autenticação exige o código DUAS vezes —
 * no corpo e no botão, que a Meta guarda como URL (sub_type 'url', index '0').
 * Errar isso só aparece no primeiro cadastro de verdade, com a conta pronta.
 */

vi.mock('../src/config/env.js', () => ({
  env: {
    WHATSAPP_ACCESS_TOKEN: 'EAAGsegredo',
    WHATSAPP_PHONE_NUMBER_ID: '1234567890',
    WHATSAPP_GRAPH_VERSION: 'v26.0',
    WHATSAPP_OTP_TEMPLATE: 'codigo_verificacao',
    WHATSAPP_TEMPLATE_LANG: 'pt_BR',
  },
  isWhatsAppConfigured: () => true,
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const { sendWhatsAppAuthCode, sendWhatsAppTemplate, whatsAppFailureOf, classifyWhatsAppFailure } = await import(
  '../src/integrations/whatsapp/index.js'
)

beforeEach(() => fetchMock.mockReset())

const metaError = (status: number, code: number, message: string) =>
  new Response(JSON.stringify({ error: { message, code, error_data: { details: 'detalhe da Meta' } } }), { status })

const captureError = async (p: Promise<unknown>): Promise<unknown> => {
  try {
    await p
  } catch (err) {
    return err
  }
  throw new Error('esperava falha')
}

describe('sendWhatsAppAuthCode', () => {
  it('template de autenticação com o código no corpo E no botão de URL', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }))
    await sendWhatsAppAuthCode('5554999998888', '012345')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v26.0/1234567890/messages')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer EAAGsegredo')
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5554999998888',
      type: 'template',
      template: {
        name: 'codigo_verificacao',
        language: { code: 'pt_BR' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: '012345' }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '012345' }] },
        ],
      },
    })
  })
})

describe('sendWhatsAppTemplate', () => {
  it('sem botão, só o componente do corpo', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    await sendWhatsAppTemplate({ to: '5511', template: 'alerta_loja', bodyParams: ['a', 'b'] })
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] },
    ])
  })
})

describe('classifyWhatsAppFailure', () => {
  it('número fora da lista de teste ou sem WhatsApp = inalcançável', async () => {
    fetchMock.mockResolvedValueOnce(metaError(400, 131030, 'Recipient phone number not in allowed list'))
    const notAllowed = whatsAppFailureOf(await captureError(sendWhatsAppAuthCode('5511', '1')))
    expect(notAllowed).toMatchObject({ provider: 'whatsapp', status: 400, code: 131030 })
    expect(notAllowed?.description).toContain('detalhe da Meta')
    expect(classifyWhatsAppFailure(notAllowed!)).toBe('unreachable')

    fetchMock.mockResolvedValueOnce(metaError(400, 131026, 'Message undeliverable'))
    const undeliverable = whatsAppFailureOf(await captureError(sendWhatsAppAuthCode('5511', '1')))
    expect(classifyWhatsAppFailure(undeliverable!)).toBe('unreachable')
  })

  it('token vencido ou template inexistente = configuração do servidor', async () => {
    fetchMock.mockResolvedValueOnce(metaError(401, 190, 'Error validating access token'))
    expect(classifyWhatsAppFailure(whatsAppFailureOf(await captureError(sendWhatsAppAuthCode('5511', '1')))!)).toBe('bad_config')

    fetchMock.mockResolvedValueOnce(metaError(404, 132001, 'Template name does not exist in the translation'))
    expect(classifyWhatsAppFailure(whatsAppFailureOf(await captureError(sendWhatsAppAuthCode('5511', '1')))!)).toBe('bad_config')
  })

  it('limite de envio e 5xx = transitório', async () => {
    fetchMock.mockResolvedValueOnce(metaError(429, 130429, 'Rate limit hit'))
    expect(classifyWhatsAppFailure(whatsAppFailureOf(await captureError(sendWhatsAppAuthCode('5511', '1')))!)).toBe('transient')

    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 502 }))
    expect(classifyWhatsAppFailure(whatsAppFailureOf(await captureError(sendWhatsAppAuthCode('5511', '1')))!)).toBe('transient')
  })

  it('a mensagem de erro não leva o token', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const err = await captureError(sendWhatsAppAuthCode('5511', '1'))
    expect(JSON.stringify({ m: (err as Error).message, c: (err as { cause?: unknown }).cause })).not.toContain('EAAGsegredo')
  })
})
