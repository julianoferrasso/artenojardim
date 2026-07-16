import { createApp } from './app.js'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { prisma } from './config/prisma.js'
import { initStoreContext } from './shared/store-context.js'
import { storage } from './integrations/storage/index.js'

/**
 * Boot: falhar aqui é barato; falhar na primeira requisição de um cliente real,
 * não. Tudo que pode ser verificado antes de aceitar tráfego é verificado aqui.
 */
const start = async (): Promise<void> => {
  await prisma.$connect()
  await initStoreContext()

  logger.info({ driver: storage().id }, 'storage')

  const app = createApp()

  const server = app.listen(env.PORT, () => {
    logger.info(`API em http://localhost:${env.PORT}${'/api/v1/health'}`)
  })

  /**
   * Graceful shutdown. Sem isso, `pm2 reload` mata o processo no meio de uma
   * transação — e no checkout isso é um pedido pago sem reserva de estoque.
   */
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'encerrando')

    server.close(async () => {
      await prisma.$disconnect()
      logger.info('encerrado')
      process.exit(0)
    })

    // Rede de segurança: conexão keep-alive pendurada não pode impedir o restart.
    setTimeout(() => {
      logger.error('shutdown excedeu 10s, forçando')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  // Estado desconhecido é estado perigoso: morra e deixe o PM2 reiniciar limpo.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'promise rejeitada sem catch')
    process.exit(1)
  })

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'exceção não capturada')
    process.exit(1)
  })
}

start().catch((err) => {
  logger.fatal({ err }, 'falha ao subir a API')
  process.exit(1)
})
