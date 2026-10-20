import { describe, it, expect, vi } from 'vitest'

/**
 * Mensagem torta na fila de alertas vai para a DLQ e não chega ao módulo: no
 * Prisma, `where: { id: undefined }` é "sem filtro", e o alerta iria para o
 * primeiro destino da loja.
 */

const deliverAlert = vi.fn(async () => {})
vi.mock('../src/modules/alerts/service.js', () => ({ deliverAlert: (...args: unknown[]) => deliverAlert(...(args as [])) }))
vi.mock('../src/config/env.js', () => ({ env: { RABBITMQ_PREFETCH: 1 } }))
vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}))
vi.mock('../src/shared/processed-events.js', () => ({ claimEvent: vi.fn(), releaseEvent: vi.fn() }))

const { alertSendHandler } = await import('../src/queues/consumers/alert-send.js')

const valid = {
  alertId: 'alert_1',
  destinationId: 'dest_1',
  types: ['ORDER_PAID'] as ['ORDER_PAID'],
  content: { subject: 's', heading: 'h', paragraphs: [], ctaLabel: 'c', ctaUrl: 'u', footerNote: 'f' },
}

describe('alertSendHandler', () => {
  it('mensagem completa segue para a entrega', async () => {
    await alertSendHandler(valid)
    expect(deliverAlert).toHaveBeenCalledWith(valid)
  })

  it('sem destino, alerta, tipo ou conteúdo: erro permanente, sem entregar', () => {
    deliverAlert.mockClear()
    for (const broken of [
      { ...valid, destinationId: undefined },
      { ...valid, alertId: '' },
      { ...valid, types: [] },
      { ...valid, content: undefined },
    ]) {
      expect(() => alertSendHandler(broken as never)).toThrow('mensagem de alerta')
    }
    expect(deliverAlert).not.toHaveBeenCalled()
  })
})
