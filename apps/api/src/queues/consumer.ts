import type { ConfirmChannel, ConsumeMessage } from 'amqplib'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { claimEvent, releaseEvent } from '../shared/processed-events.js'
import type { EventEnvelope } from '../shared/publish.js'
import {
  DLX,
  EXCHANGE,
  MAX_RETRIES,
  RETRY_HEADER,
  dlqName,
  retryQueueName,
} from './topology.js'

/**
 * O laço de consumo (docs/arquitetura.md §12). Um só, genérico, para todas as
 * filas: parse → idempotência → handler → ack, e falha vai para retry ou DLQ.
 */

export type Handler<T = unknown> = (payload: T, envelope: EventEnvelope<T>) => Promise<void>

/**
 * Erro que o retry não conserta: destinatário inválido, produto apagado, payload
 * malformado. Vai DIRETO para a DLQ, sem gastar as três tentativas.
 *
 * Sem esta distinção, uma campanha para uma base com 50 endereços mortos enche a
 * DLQ de ruído três vezes maior — e o alerta de "DLQ > 0" perde o sentido.
 *
 * Factory e não classe, como `appError`: a marca é uma propriedade, não um tipo.
 */
const PERMANENT = Symbol.for('artenojardim.permanentError')

export const permanentError = (message: string, cause?: unknown): Error =>
  Object.assign(new Error(message, cause ? { cause } : undefined), { [PERMANENT]: true as const })

const isPermanent = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && PERMANENT in err

const retryCountOf = (msg: ConsumeMessage): number => {
  const raw = msg.properties.headers?.[RETRY_HEADER]
  const n = typeof raw === 'number' ? raw : Number(raw ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Reencaminha a mensagem falha e dá ACK na original.
 *
 * NUNCA `nack(requeue: true)`: ele devolve a mensagem para a frente da fila, ela
 * é reprocessada na hora, falha de novo, e vira um laço infinito a 100% de CPU
 * que trava a fila para todo mundo.
 */
const routeToRetryOrDlq = (
  ch: ConfirmChannel,
  queue: string,
  msg: ConsumeMessage,
  permanent: boolean,
): void => {
  const attempt = retryCountOf(msg)

  if (permanent || attempt >= MAX_RETRIES) {
    ch.publish(DLX, dlqName(queue), msg.content, {
      persistent: true,
      headers: { ...msg.properties.headers, [RETRY_HEADER]: attempt },
    })
    logger.error({ queue, attempt, permanent }, 'mensagem enviada para a DLQ')
  } else {
    // Publicada DIRETO na fila de retry (default exchange, routing key = nome da
    // fila). Ela não tem consumidor: o TTL expira e o dead-letter devolve a
    // mensagem ao exchange principal, que a reencaminha para a fila de origem.
    ch.sendToQueue(retryQueueName(queue, attempt), msg.content, {
      persistent: true,
      headers: { ...msg.properties.headers, [RETRY_HEADER]: attempt + 1 },
    })
    logger.warn({ queue, attempt: attempt + 1 }, 'mensagem reagendada para retry')
  }

  ch.ack(msg)
}

export const consume = async <T>(
  ch: ConfirmChannel,
  queue: string,
  handler: Handler<T>,
): Promise<string> => {
  await ch.prefetch(env.RABBITMQ_PREFETCH)

  const { consumerTag } = await ch.consume(queue, (msg) => {
    if (!msg) return
    void handleMessage(ch, queue, msg, handler)
  })

  logger.info({ queue, consumerTag }, 'consumidor registrado')
  return consumerTag
}

const handleMessage = async <T>(
  ch: ConfirmChannel,
  queue: string,
  msg: ConsumeMessage,
  handler: Handler<T>,
): Promise<void> => {
  let envelope: EventEnvelope<T>

  try {
    envelope = JSON.parse(msg.content.toString()) as EventEnvelope<T>
    if (!envelope?.id) throw new Error('envelope sem id')
  } catch (err) {
    // Payload que não é o nosso envelope nunca vai virar válido no retry.
    logger.error({ err, queue }, 'mensagem ilegível — direto para a DLQ')
    routeToRetryOrDlq(ch, queue, msg, true)
    return
  }

  // Marca ANTES de executar: a alternativa (checar, executar, marcar) deixa uma
  // janela em que duas entregas simultâneas passam as duas pela checagem.
  const claimed = await claimEvent(envelope.id, queue).catch((err: unknown) => {
    logger.error({ err, eventId: envelope.id }, 'falha ao registrar o evento')
    return null
  })

  if (claimed === null) {
    // Banco indisponível não é culpa da mensagem — vale a pena tentar de novo.
    routeToRetryOrDlq(ch, queue, msg, false)
    return
  }

  if (!claimed) {
    logger.info({ eventId: envelope.id, queue }, 'evento já processado — ignorado')
    ch.ack(msg)
    return
  }

  try {
    await handler(envelope.payload, envelope)
    ch.ack(msg)
  } catch (err) {
    // Libera a marca, senão o retry chega, vê "já processado" e descarta a
    // mensagem sem nunca ter feito o trabalho.
    await releaseEvent(envelope.id).catch((e: unknown) =>
      logger.error({ err: e, eventId: envelope.id }, 'falha ao liberar o evento'),
    )

    const permanent = isPermanent(err)
    logger.error({ err, queue, eventId: envelope.id, permanent }, 'falha ao processar evento')
    routeToRetryOrDlq(ch, queue, msg, permanent)
  }
}
