import type { ConfirmChannel } from 'amqplib'
import { EVENTS } from '@ecommerce/shared/constants'

/**
 * Topologia do RabbitMQ (docs/arquitetura.md §12). Declarada por quem conecta,
 * API e worker, e idempotente: `assertQueue` sobre fila existente não faz nada.
 *
 * ── Retry por TTL, nunca nack(requeue: true) ─────────────────────────────────
 * `nack` com requeue devolve a mensagem para a FRENTE da fila: ela é
 * reprocessada na hora, falha de novo, e o resultado é um laço infinito a 100%
 * de CPU que trava a fila para todo mundo. É o erro mais comum com RabbitMQ.
 *
 * O padrão correto é topologia, não código: publicar numa fila `<fila>.retry.5s`
 * que NÃO TEM CONSUMIDOR. Passados 5s o TTL expira e o próprio RabbitMQ
 * dead-letter a mensagem de volta para a fila original. Backoff sem cron, sem
 * scheduler, sem uma linha de agendamento nossa.
 */

export const EXCHANGE = 'ecommerce.events'
export const DLX = 'ecommerce.dlx'

/**
 * `campaign.dispatch` é a QUINTA fila — o §12 previa quatro, e o gatilho que ele
 * mesmo define ("consumidor real novo") foi acionado. Ela existe separada de
 * `email.send` por uma razão de vazão: com `prefetch(1)`, um orquestrador que
 * publica 2.000 mensagens ocuparia o único slot do consumidor, e a recuperação
 * de senha de um cliente ficaria presa atrás da campanha de marketing.
 */
export const QUEUES = {
  emailSend: 'email.send',
  campaignDispatch: 'campaign.dispatch',
  orderPaid: 'order.paid',
  shippingLabel: 'shipping.label',
  shippingTracking: 'shipping.tracking',
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

/** Sufixo → TTL. A ordem é a da escalada: 5s, 30s, 5min, depois DLQ. */
export const RETRY_STEPS = [
  { suffix: '5s', ttlMs: 5_000 },
  { suffix: '30s', ttlMs: 30_000 },
  { suffix: '5m', ttlMs: 300_000 },
] as const

export const MAX_RETRIES = RETRY_STEPS.length

export const retryQueueName = (queue: string, attempt: number): string =>
  `${queue}.retry.${RETRY_STEPS[attempt]!.suffix}`

export const dlqName = (queue: string): string => `${queue}.dlq`

/** Header que carrega a contagem de tentativas entre a fila e as de retry. */
export const RETRY_HEADER = 'x-retry-count'

/**
 * Quem escuta o quê. `email.*` num binding só: todo evento de e-mail vai para o
 * mesmo worker genérico, que decide o template pelo payload.
 */
const BINDINGS: ReadonlyArray<{ queue: QueueName; pattern: string }> = [
  { queue: QUEUES.emailSend, pattern: 'email.*' },
  { queue: QUEUES.campaignDispatch, pattern: EVENTS.campaign.dispatchRequested },
  { queue: QUEUES.orderPaid, pattern: EVENTS.order.paid },
  { queue: QUEUES.shippingLabel, pattern: EVENTS.shipping.labelRequested },
  { queue: QUEUES.shippingTracking, pattern: EVENTS.shipping.trackingSync },
]

export const assertTopology = async (ch: ConfirmChannel): Promise<void> => {
  await ch.assertExchange(EXCHANGE, 'topic', { durable: true })
  await ch.assertExchange(DLX, 'topic', { durable: true })

  for (const { queue, pattern } of BINDINGS) {
    // `durable` + `persistent` no publish = a mensagem sobrevive a um restart do
    // broker. Sem isso, um `pm2 restart` na hora errada perde pedidos pagos.
    await ch.assertQueue(queue, {
      durable: true,
      deadLetterExchange: DLX,
      deadLetterRoutingKey: dlqName(queue),
    })
    await ch.bindQueue(queue, EXCHANGE, pattern)

    for (const [attempt, step] of RETRY_STEPS.entries()) {
      const name = retryQueueName(queue, attempt)
      // Sem consumidor de propósito: o TTL expira e o dead-letter devolve a
      // mensagem ao exchange principal com a routing key ORIGINAL, que a
      // reencaminha para a fila de origem. O atraso é a única função da fila.
      await ch.assertQueue(name, {
        durable: true,
        messageTtl: step.ttlMs,
        deadLetterExchange: EXCHANGE,
      })
    }

    // A DLQ também não tem consumidor, e isto NÃO é um esquecimento: mensagem
    // parada aqui é bug, e bug se corrige, não se reprocessa cegamente. O
    // reprocessamento vem depois do fix, pelo admin.
    await ch.assertQueue(dlqName(queue), { durable: true })
    await ch.bindQueue(dlqName(queue), DLX, dlqName(queue))
  }
}
