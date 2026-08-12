import amqp, { type ChannelModel, type ConfirmChannel } from 'amqplib'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { env, isQueueConfigured } from './env.js'
import { logger } from './logger.js'
import { appError } from '../shared/errors.js'

/**
 * O ÚNICO lugar do projeto que conhece `amqplib`. Quem publica usa
 * `shared/publish.ts`; quem consome usa `queues/consumer.ts`.
 *
 * ── Por que ConfirmChannel e não Channel ─────────────────────────────────────
 * `channel.publish()` num canal normal devolve `true` só por a mensagem CABER no
 * buffer local — não por o broker tê-la aceitado. Um broker que morre entre o
 * commit e o flush do buffer perde a mensagem em silêncio, depois de a API já ter
 * respondido 202 ao lojista. Com publisher confirms há um await de verdade.
 *
 * ── Por que a conexão não bloqueia o boot ────────────────────────────────────
 * Broker fora do ar não pode derrubar a loja. `initRabbit()` agenda a conexão e
 * volta na hora; até ela existir, `getChannel()` lança 503 e o endpoint responde
 * um erro claro. A loja continua vendendo — só a campanha espera.
 */

/** Backoff da reconexão. Teto de 30s: além disso é só barulho no log. */
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 15_000, 30_000] as const

let connection: ChannelModel | null = null
let channel: ConfirmChannel | null = null
let attempt = 0
/** Evita duas reconexões em voo quando 'error' e 'close' disparam juntos. */
let reconnecting = false
/** Impede que o retry agendado continue depois de um shutdown pedido. */
let stopped = false

/** Chamado após cada (re)conexão — é onde a topologia é declarada. */
type OnReady = (ch: ConfirmChannel) => Promise<void>
let onReady: OnReady | undefined

const scheduleReconnect = (): void => {
  if (stopped || reconnecting) return
  reconnecting = true

  const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]!
  attempt += 1

  logger.warn({ delay, attempt }, 'RabbitMQ: reconectando')
  // `unref` para o timer pendente não segurar o processo vivo no shutdown.
  setTimeout(() => {
    reconnecting = false
    void connect()
  }, delay).unref()
}

const connect = async (): Promise<void> => {
  if (stopped) return

  try {
    const conn = await amqp.connect(env.RABBITMQ_URL!)
    const ch = await conn.createConfirmChannel()

    // Antes de publicar o estado: se a topologia falhar, não queremos um canal
    // "pronto" apontando para filas que não existem.
    if (onReady) await onReady(ch)

    connection = conn
    channel = ch
    attempt = 0

    // `once`: os dois eventos podem disparar em sequência na mesma queda, e sem
    // isto agendaríamos duas reconexões concorrentes.
    conn.once('error', (err) => logger.error({ err }, 'RabbitMQ: erro na conexão'))
    conn.once('close', () => {
      // Só limpa se ainda for a conexão corrente: um 'close' atrasado de uma
      // conexão antiga não pode derrubar a nova que acabou de subir.
      if (connection !== conn) return
      connection = null
      channel = null
      logger.warn('RabbitMQ: conexão fechada')
      scheduleReconnect()
    })

    logger.info('RabbitMQ: conectado')
  } catch (err) {
    connection = null
    channel = null
    logger.error({ err }, 'RabbitMQ: falha ao conectar')
    scheduleReconnect()
  }
}

/**
 * Agenda a conexão e VOLTA NA HORA. Não use await esperando canal pronto —
 * é justamente o que mantém o boot da API independente do broker.
 */
export const initRabbit = (ready?: OnReady): void => {
  if (!isQueueConfigured()) {
    logger.warn('RabbitMQ: RABBITMQ_URL ausente — publicações responderão 503')
    return
  }
  stopped = false
  onReady = ready
  void connect()
}

/** Versão bloqueante, para o worker: um worker sem fila não tem o que fazer. */
export const connectRabbitOrThrow = async (ready?: OnReady): Promise<ConfirmChannel> => {
  const url = env.RABBITMQ_URL
  if (!url) {
    throw new Error('RABBITMQ_URL é obrigatório para o worker')
  }
  stopped = false
  onReady = ready

  const conn = await amqp.connect(url)
  const ch = await conn.createConfirmChannel()
  if (ready) await ready(ch)

  connection = conn
  channel = ch

  // No worker a queda é fatal de propósito: o PM2 reinicia o processo, o que
  // recria consumidores e topologia do zero. Reanexar consumidores a um canal
  // novo à mão é o tipo de estado que se perde sem ninguém notar.
  conn.once('close', () => {
    if (stopped) return
    logger.error('RabbitMQ: conexão do worker caiu — encerrando para o PM2 reiniciar')
    process.exit(1)
  })

  return ch
}

export const getChannel = (): ConfirmChannel => {
  if (!channel) {
    throw appError(
      ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      'Fila indisponível no momento. Tente novamente em instantes.',
      503,
    )
  }
  return channel
}

export const isRabbitUp = (): boolean => channel !== null

export const closeRabbit = async (): Promise<void> => {
  stopped = true
  const conn = connection
  connection = null
  channel = null
  if (!conn) return

  try {
    await conn.close()
  } catch (err) {
    // Fechar o que já está caindo não é problema que mereça derrubar o shutdown.
    logger.warn({ err }, 'RabbitMQ: erro ao fechar a conexão')
  }
}
