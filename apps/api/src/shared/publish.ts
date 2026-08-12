import { randomUUID } from 'node:crypto'
import { QUEUED_EVENTS, type QueuedEvent } from '@ecommerce/shared/constants'
import { getChannel } from '../config/rabbitmq.js'
import { logger } from '../config/logger.js'
import { EXCHANGE } from '../queues/topology.js'

/**
 * Publica um evento no barramento interno.
 *
 * Só o SERVICE publica, e SEMPRE depois do commit. Publicar dentro da transação
 * é o erro clássico: se ela der rollback, um evento sobre um fato que nunca
 * aconteceu já está na fila, e o consumidor age sobre um pedido inexistente.
 */

export type EventEnvelope<T = unknown> = {
  /** Chave de idempotência do consumidor. */
  id: string
  type: QueuedEvent
  occurredAt: string
  payload: T
}

const isQueuedEvent = (key: string): key is QueuedEvent =>
  (QUEUED_EVENTS as readonly string[]).includes(key)

export const publish = async (routingKey: QueuedEvent, payload: unknown): Promise<void> => {
  // "Não publique evento sem consumidor" é regra do projeto; esta linha a torna
  // um erro em runtime em vez de uma convenção que alguém esquece. Mensagem numa
  // routing key sem binding é descartada pelo exchange EM SILÊNCIO — o pior modo
  // de falhar que existe, porque parece que funcionou.
  if (!isQueuedEvent(routingKey)) {
    throw new Error(`Evento ${routingKey} não está em QUEUED_EVENTS — ninguém consome`)
  }

  const id = randomUUID()
  const envelope: EventEnvelope = {
    id,
    type: routingKey,
    occurredAt: new Date().toISOString(),
    payload,
  }

  const channel = getChannel()

  await new Promise<void>((resolve, reject) => {
    channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(envelope)), {
      persistent: true,
      messageId: id,
      contentType: 'application/json',
    },
    // O callback do confirm é o que diferencia "o broker aceitou" de "coube no
    // buffer local". Sem ele, `publish` mente quando o broker está morrendo.
    (err) => (err ? reject(err) : resolve()))
  })

  logger.debug({ eventId: id, type: routingKey }, 'evento publicado')
}
