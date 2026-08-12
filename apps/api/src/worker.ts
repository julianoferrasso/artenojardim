import { logger } from './config/logger.js'
import { prisma } from './config/prisma.js'
import { closeRabbit, connectRabbitOrThrow } from './config/rabbitmq.js'
import { initStoreContext } from './shared/store-context.js'
import { consume } from './queues/consumer.js'
import { QUEUES, assertTopology } from './queues/topology.js'
import { campaignDispatchHandler } from './queues/consumers/campaign-dispatch.js'
import { emailSendHandler } from './queues/consumers/email-send.js'
import { orderPaidHandler } from './queues/consumers/order-paid.js'

/**
 * Processo dos consumidores. SEPARADO da API, e não uma thread dentro dela:
 *
 *   1. A API pode `pm2 reload`. Um worker com mensagem não-ackada precisa do
 *      próprio ciclo de shutdown, e misturar os dois torna o reload da API mais
 *      lento e mais arriscado.
 *   2. O ecosystem prevê a API virar cluster. Se virar, CADA instância abriria um
 *      consumidor, e o `prefetch(1)` viraria `prefetch(N)` sem ninguém decidir —
 *      junto com N vezes a taxa de envio contra o limite do SES.
 *   3. Uma campanha grande enchendo a heap não pode derrubar a loja: aqui o
 *      `max_memory_restart` mata só o worker.
 */
const start = async (): Promise<void> => {
  await prisma.$connect()
  await initStoreContext()

  // Aqui a conexão BLOQUEIA, ao contrário da API: um worker sem fila não tem o
  // que fazer, e subir "pronto" sem consumir nada esconderia o problema.
  const channel = await connectRabbitOrThrow(assertTopology)

  const tags = [
    await consume(channel, QUEUES.campaignDispatch, campaignDispatchHandler),
    await consume(channel, QUEUES.emailSend, emailSendHandler),
    await consume(channel, QUEUES.orderPaid, orderPaidHandler),
  ]

  logger.info({ queues: Object.keys(tags).length }, 'worker pronto')

  /**
   * Shutdown: cancelar o consumidor PRIMEIRO (para de receber mensagens novas),
   * depois fechar. Sem isso, `pm2 reload` mata o processo com uma mensagem em
   * voo — que volta pela fila e é reprocessada, mas com o e-mail já enviado.
   */
  let closing = false
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return
    closing = true
    logger.info({ signal }, 'encerrando worker')

    try {
      for (const tag of tags) await channel.cancel(tag)
      await closeRabbit()
      await prisma.$disconnect()
      logger.info('worker encerrado')
      process.exit(0)
    } catch (err) {
      logger.error({ err }, 'falha no shutdown do worker')
      process.exit(1)
    }
  }

  // Rede de segurança: um handler pendurado não pode impedir o deploy.
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
    setTimeout(() => {
      logger.error('shutdown do worker excedeu 15s, forçando')
      process.exit(1)
    }, 15_000).unref()
  })
  process.on('SIGINT', () => void shutdown('SIGINT'))

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'promise rejeitada sem catch no worker')
    process.exit(1)
  })

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'exceção não capturada no worker')
    process.exit(1)
  })
}

start().catch((err) => {
  logger.fatal({ err }, 'falha ao subir o worker')
  process.exit(1)
})
