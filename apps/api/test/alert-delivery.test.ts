import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appError } from '../src/shared/errors.js'

/**
 * A entrega de um alerta a UM destino, com banco e provedores mockados. O que se
 * trava aqui é o que cada tipo de falha ESCREVE:
 *  - entregue: histórico ok + último envio;
 *  - servidor sem o canal: só o histórico — nunca o destino, porque dev e
 *    produção dividem o banco e um worker de dev sem token "quebraria" o de
 *    produção;
 *  - Telegram bloqueado: pausa o destino;
 *  - transitória: registra e lança, para a fila tentar de novo.
 */

const channels = { email: true, telegram: true, whatsapp: true }

vi.mock('../src/config/env.js', () => ({
  env: { ADMIN_URL: 'https://admin.loja.test', WHATSAPP_ALERT_TEMPLATE: 'alerta_loja' },
  isEmailConfigured: () => channels.email,
}))

vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}))

vi.mock('../src/shared/store-context.js', () => ({ getActiveStoreId: () => 'store_1' }))

vi.mock('../src/shared/email-branding.js', () => ({
  getEmailBranding: async () => ({ storeName: 'Loja', storeUrl: 'https://loja.test', logoUrl: null }),
}))

const publish = vi.fn(async () => {})
vi.mock('../src/shared/publish.js', () => ({ publish: (...args: unknown[]) => publish(...(args as [])) }))

const sendEmail = vi.fn(async () => {})
vi.mock('../src/integrations/email/index.js', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...(args as [])),
  renderNotice: () => ({ subject: 's', html: 'h', text: 't' }),
  isPermanentSesError: (err: unknown) => (err as { name?: string })?.name === 'MessageRejected',
}))

const sendTelegramMessage = vi.fn(async () => {})
vi.mock('../src/integrations/telegram/index.js', async () => {
  const actual = await vi.importActual<typeof import('../src/integrations/telegram/client.js')>(
    '../src/integrations/telegram/client.js',
  )
  return {
    sendTelegramMessage: (...args: unknown[]) => sendTelegramMessage(...(args as [])),
    isTelegramConfigured: () => channels.telegram,
    telegramFailureOf: actual.telegramFailureOf,
    classifyTelegramFailure: actual.classifyTelegramFailure,
  }
})

vi.mock('../src/integrations/whatsapp/index.js', () => ({
  isWhatsAppConfigured: () => channels.whatsapp,
  sendWhatsAppTemplate: vi.fn(async () => {}),
  sendWhatsAppAuthCode: vi.fn(async () => {}),
  whatsAppFailureOf: () => null,
  classifyWhatsAppFailure: () => 'transient',
}))

type Destination = {
  id: string
  channel: 'EMAIL' | 'TELEGRAM' | 'WHATSAPP'
  label: string
  address: string | null
  enabled: boolean
  verifiedAt: Date | null
}

let destination: Destination | null
let previousDelivery: { error: string | null } | null

const db = {
  alertDestination: {
    findFirst: vi.fn(async () => destination),
    findMany: vi.fn(async () => [] as { id: string }[]),
    updateMany: vi.fn(async (_args: unknown) => ({ count: 1 })),
  },
  alertDelivery: {
    findUnique: vi.fn(async () => previousDelivery),
    upsert: vi.fn(async (_args: unknown) => ({})),
  },
  alert: { create: vi.fn(async () => ({ id: 'alert_1' })) },
}
vi.mock('../src/config/prisma.js', () => ({ prisma: db }))

const { deliverAlert, raiseAlert } = await import('../src/modules/alerts/delivery.js')

const job = {
  alertId: 'alert_1',
  destinationId: 'dest_1',
  types: ['ORDER_PAID'] as ['ORDER_PAID'],
  content: {
    subject: 'Pedido pago',
    heading: 'Novo pedido pago: #1',
    paragraphs: ['Maria pagou.'],
    ctaLabel: 'Abrir',
    ctaUrl: 'https://admin.loja.test/pedidos/1',
    footerNote: 'rodapé',
  },
}

const telegramFailure = (status: number, description: string) =>
  appError('EXTERNAL_SERVICE_ERROR', 'Telegram recusou', 502, undefined, {
    provider: 'telegram',
    method: 'sendMessage',
    status,
    description,
  })

const destinationWrite = () => (db.alertDestination.updateMany.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> })?.data
const deliveryWrite = () => db.alertDelivery.upsert.mock.calls.at(-1)?.[0] as { create: { error: string | null } }

beforeEach(() => {
  vi.clearAllMocks()
  channels.email = true
  channels.telegram = true
  channels.whatsapp = true
  previousDelivery = null
  destination = {
    id: 'dest_1',
    channel: 'TELEGRAM',
    label: 'Celular',
    address: '777',
    enabled: true,
    verifiedAt: new Date(),
  }
})

describe('deliverAlert', () => {
  it('entregue: histórico sem erro e último envio no destino', async () => {
    await deliverAlert(job)

    expect(sendTelegramMessage).toHaveBeenCalledOnce()
    expect(deliveryWrite().create.error).toBeNull()
    expect(destinationWrite()).toMatchObject({ lastError: null })
    expect(destinationWrite()['lastSentAt']).toBeInstanceOf(Date)
  })

  it('já entregue antes (ack perdido): não manda de novo', async () => {
    previousDelivery = { error: null }
    await deliverAlert(job)
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('pausado ou excluído entre o fato e a entrega: nada a fazer', async () => {
    destination = { ...destination!, enabled: false }
    await deliverAlert(job)
    destination = null
    await deliverAlert(job)
    expect(sendTelegramMessage).not.toHaveBeenCalled()
    expect(db.alertDelivery.upsert).not.toHaveBeenCalled()
  })

  it('servidor sem o canal: registra no histórico, NUNCA no destino, e não volta para a fila', async () => {
    channels.telegram = false
    await expect(deliverAlert(job)).resolves.toBeUndefined()

    expect(sendTelegramMessage).not.toHaveBeenCalled()
    expect(deliveryWrite().create.error).toContain('não está configurado')
    expect(db.alertDestination.updateMany).not.toHaveBeenCalled()
  })

  it('token do bot revogado também é do servidor: não marca o destino', async () => {
    sendTelegramMessage.mockRejectedValueOnce(telegramFailure(401, 'Unauthorized'))
    await deliverAlert(job)
    expect(db.alertDestination.updateMany).not.toHaveBeenCalled()
  })

  it('bot bloqueado: pausa o destino com o motivo, sem retry', async () => {
    sendTelegramMessage.mockRejectedValueOnce(telegramFailure(403, 'Forbidden: bot was blocked by the user'))
    await expect(deliverAlert(job)).resolves.toBeUndefined()

    expect(destinationWrite()).toMatchObject({ enabled: false })
    expect(String(destinationWrite()['lastError'])).toContain('não consegue escrever')
  })

  it('falha transitória: registra e lança, para a fila tentar de novo', async () => {
    sendTelegramMessage.mockRejectedValueOnce(telegramFailure(502, 'Bad Gateway'))
    await expect(deliverAlert(job)).rejects.toThrow('entrega do alerta falhou')

    expect(deliveryWrite().create.error).toContain('não respondeu')
    expect(destinationWrite()).not.toHaveProperty('enabled')
  })

  it('grupo que virou supergrupo: troca o chat_id e entrega no novo', async () => {
    sendTelegramMessage.mockRejectedValueOnce(
      appError('EXTERNAL_SERVICE_ERROR', 'x', 502, undefined, {
        provider: 'telegram',
        method: 'sendMessage',
        status: 400,
        description: 'group chat was upgraded to a supergroup chat',
        migrateToChatId: '-100999',
      }),
    )
    await deliverAlert(job)

    expect(db.alertDestination.updateMany).toHaveBeenCalledWith({ where: { id: 'dest_1' }, data: { address: '-100999' } })
    expect(sendTelegramMessage).toHaveBeenLastCalledWith({ chatId: '-100999', html: expect.any(String) })
    expect(deliveryWrite().create.error).toBeNull()
  })

  it('e-mail recusado pelo SES (permanente) não volta para a fila e não pausa', async () => {
    destination = { ...destination!, channel: 'EMAIL', address: 'ana@loja.test' }
    sendEmail.mockRejectedValueOnce(Object.assign(new Error('rejected'), { name: 'MessageRejected' }))
    await expect(deliverAlert(job)).resolves.toBeUndefined()
    expect(destinationWrite()).not.toHaveProperty('enabled')
    expect(String(destinationWrite()['lastError'])).toContain('SES')
  })
})

describe('raiseAlert', () => {
  it('ninguém inscrito: nem grava o alerta, nem publica', async () => {
    await raiseAlert(['LOW_STOCK'], job.content)
    expect(db.alert.create).not.toHaveBeenCalled()
    expect(publish).not.toHaveBeenCalled()
  })

  it('uma mensagem por destino inscrito em QUALQUER dos tipos, com o título no histórico', async () => {
    db.alertDestination.findMany.mockResolvedValueOnce([{ id: 'd1' }, { id: 'd2' }])
    await raiseAlert(['REFUND_FAILED', 'ORDER_CANCELED_BY_CUSTOMER'], job.content)

    expect(db.alertDestination.findMany).toHaveBeenCalledWith({
      where: {
        storeId: 'store_1',
        enabled: true,
        verifiedAt: { not: null },
        events: { hasSome: ['REFUND_FAILED', 'ORDER_CANCELED_BY_CUSTOMER'] },
      },
      select: { id: true },
    })
    expect(db.alert.create).toHaveBeenCalledWith({
      data: { storeId: 'store_1', type: 'REFUND_FAILED', title: 'Novo pedido pago: #1' },
      select: { id: true },
    })
    expect(publish).toHaveBeenCalledTimes(2)
    expect(publish).toHaveBeenCalledWith('alert.send_requested', expect.objectContaining({ destinationId: 'd2' }))
  })
})
