import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O laço de consumo: idempotência, retry por TTL e DLQ.
 *
 * Estes testes nasceram de um bug real encontrado NO DEPLOY: a marca de
 * idempotência era liberada em TODA falha, inclusive na permanente. Como a
 * mensagem permanente vai para a DLQ e não volta sozinha, a marca sumia — e uma
 * reentrega do broker (ou o reprocessamento manual da DLQ depois do fix) rodava
 * o handler uma segunda vez. Para o e-mail, isso é o cliente recebendo duas vezes.
 *
 * Prisma e env são mockados: o que se exercita aqui é a MÁQUINA DE ESTADOS, e ela
 * não precisa de banco nem de broker.
 */

const claimed = new Set<string>()

vi.mock('../src/config/env.js', () => ({
  env: { RABBITMQ_PREFETCH: 1 },
}))

vi.mock('../src/config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}))

vi.mock('../src/shared/processed-events.js', () => ({
  // Reproduz a semântica real: `create` com unique na PK — o segundo claim do
  // mesmo id devolve false.
  claimEvent: vi.fn(async (id: string) => {
    if (claimed.has(id)) return false
    claimed.add(id)
    return true
  }),
  releaseEvent: vi.fn(async (id: string) => {
    claimed.delete(id)
  }),
}))

const { consume, permanentError } = await import('../src/queues/consumer.js')
const { RETRY_HEADER } = await import('../src/queues/topology.js')

type Delivered = { queue: string; headers: Record<string, unknown> }

/** Canal falso: guarda para onde cada mensagem foi e quantos acks houve. */
const makeChannel = () => {
  const toDlq: Delivered[] = []
  const toRetry: Delivered[] = []
  let acks = 0
  let onMessage: ((msg: unknown) => void) | undefined

  const channel = {
    prefetch: vi.fn(async () => undefined),
    consume: vi.fn(async (_q: string, cb: (msg: unknown) => void) => {
      onMessage = cb
      return { consumerTag: 'tag-teste' }
    }),
    publish: vi.fn((_ex: string, key: string, _c: Buffer, opts: { headers: Record<string, unknown> }) => {
      toDlq.push({ queue: key, headers: opts.headers })
      return true
    }),
    sendToQueue: vi.fn((key: string, _c: Buffer, opts: { headers: Record<string, unknown> }) => {
      toRetry.push({ queue: key, headers: opts.headers })
      return true
    }),
    ack: vi.fn(() => {
      acks += 1
    }),
    nack: vi.fn(),
  }

  const deliver = async (envelope: unknown, retryCount = 0) => {
    onMessage?.({
      content: Buffer.from(JSON.stringify(envelope)),
      properties: { headers: retryCount > 0 ? { [RETRY_HEADER]: retryCount } : {} },
    })
    // O handler roda em microtask; deixa a fila drenar antes de conferir.
    await new Promise((r) => setTimeout(r, 0))
  }

  return { channel, deliver, toDlq, toRetry, acks: () => acks }
}

const envelopeOf = (id: string) => ({
  id,
  type: 'order.paid',
  occurredAt: '2026-08-12T00:00:00.000Z',
  payload: { orderId: 'x' },
})

beforeEach(() => {
  claimed.clear()
  vi.clearAllMocks()
})

describe('idempotência', () => {
  it('o mesmo evento entregue 3× roda o handler UMA vez', async () => {
    const { channel, deliver, acks } = makeChannel()
    const handler = vi.fn(async () => undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await consume(channel as any, 'order.paid', handler)

    const ev = envelopeOf('evento-1')
    await deliver(ev)
    await deliver(ev)
    await deliver(ev)

    expect(handler).toHaveBeenCalledTimes(1)
    // As três são ackadas: a duplicata é descartada, não devolvida.
    expect(acks()).toBe(3)
  })

  it('eventos diferentes rodam o handler cada um', async () => {
    const { channel, deliver } = makeChannel()
    const handler = vi.fn(async () => undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await consume(channel as any, 'order.paid', handler)

    await deliver(envelopeOf('a'))
    await deliver(envelopeOf('b'))

    expect(handler).toHaveBeenCalledTimes(2)
  })
})

describe('erro PERMANENTE', () => {
  it('vai direto para a DLQ, sem gastar retry', async () => {
    const { channel, deliver, toDlq, toRetry } = makeChannel()
    const handler = vi.fn(async () => {
      throw permanentError('pedido não existe')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await consume(channel as any, 'order.paid', handler)

    await deliver(envelopeOf('permanente-1'))

    expect(toRetry).toHaveLength(0)
    expect(toDlq).toHaveLength(1)
    expect(toDlq[0]!.queue).toBe('order.paid.dlq')
  })

  it('MANTÉM a marca de idempotência — o bug encontrado no deploy', async () => {
    const { channel, deliver, toDlq } = makeChannel()
    const handler = vi.fn(async () => {
      throw permanentError('pedido não existe')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await consume(channel as any, 'order.paid', handler)

    const ev = envelopeOf('permanente-2')
    await deliver(ev)
    // A mensagem já está na DLQ. Uma reentrega do broker não pode reexecutar.
    await deliver(ev)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(toDlq).toHaveLength(1)
  })
})

describe('erro TRANSITÓRIO', () => {
  it('escala 5s → 30s → 5m e só então cai na DLQ', async () => {
    const { channel, deliver, toDlq, toRetry } = makeChannel()
    const handler = vi.fn(async () => {
      throw new Error('SES fora do ar')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await consume(channel as any, 'order.paid', handler)

    // Cada entrega simula a volta pela fila de retry, com o header incrementado.
    await deliver(envelopeOf('transitorio-1'), 0)
    await deliver(envelopeOf('transitorio-2'), 1)
    await deliver(envelopeOf('transitorio-3'), 2)
    await deliver(envelopeOf('transitorio-4'), 3)

    expect(toRetry.map((r) => r.queue)).toEqual([
      'order.paid.retry.5s',
      'order.paid.retry.30s',
      'order.paid.retry.5m',
    ])
    // A quarta falha esgota as tentativas.
    expect(toDlq).toHaveLength(1)
  })

  it('LIBERA a marca — senão o retry veria "já processado" e descartaria', async () => {
    const { channel, deliver } = makeChannel()
    const handler = vi.fn(async () => {
      throw new Error('banco indisponível')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await consume(channel as any, 'order.paid', handler)

    const ev = envelopeOf('transitorio-volta')
    await deliver(ev, 0)
    // É a MESMA mensagem voltando pela fila de retry: tem que rodar de novo.
    await deliver(ev, 1)

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('incrementa o contador de tentativas no header', async () => {
    const { channel, deliver, toRetry } = makeChannel()
    const handler = vi.fn(async () => {
      throw new Error('falhou')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await consume(channel as any, 'order.paid', handler)

    await deliver(envelopeOf('contador'), 1)

    expect(toRetry[0]!.headers[RETRY_HEADER]).toBe(2)
  })
})

describe('mensagem ilegível', () => {
  it('vai direto para a DLQ: JSON quebrado não vira válido no retry', async () => {
    const { channel, toDlq, toRetry } = makeChannel()
    const handler = vi.fn(async () => undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await consume(channel as any, 'order.paid', handler)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(channel.consume as any).mock.calls[0][1]({
      content: Buffer.from('isto não é json'),
      properties: { headers: {} },
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(handler).not.toHaveBeenCalled()
    expect(toRetry).toHaveLength(0)
    expect(toDlq).toHaveLength(1)
  })
})
