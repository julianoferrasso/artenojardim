import { PrismaClient, type Prisma } from '@prisma/client'
import { isDevelopment } from './env.js'
import { logger } from './logger.js'

/**
 * A config de log é uma constante, não um ternário: o PrismaClient infere os
 * eventos de `$on` a partir DESTE literal. Um `log` condicional vira união de
 * tipos e o `$on('query')` deixa de compilar.
 *
 * Sempre emitimos; o que muda por ambiente é o que fazemos com o evento.
 */
const logConfig = [
  { emit: 'event', level: 'query' },
  { emit: 'event', level: 'warn' },
  { emit: 'event', level: 'error' },
] satisfies Prisma.LogDefinition[]

/**
 * Singleton. Em dev o tsx recarrega o módulo a cada save; sem o cache no
 * globalThis, cada reload abriria um pool novo até estourar max_connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const createClient = (): PrismaClient => {
  const client = new PrismaClient({ log: logConfig })

  client.$on('query', (e) => {
    // Em produção, só a query lenta interessa: logar toda query é um segundo
    // banco de dados feito de texto. Em dev o limiar é o mesmo — o ruído esconde
    // o sinal igual nos dois lugares.
    if (e.duration > 100) {
      logger.warn({ durationMs: e.duration, query: e.query }, 'query lenta')
    }
  })

  client.$on('warn', (e) => logger.warn({ prisma: e.message }))
  client.$on('error', (e) => logger.error({ prisma: e.message }))

  return client
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (isDevelopment) globalForPrisma.prisma = prisma

export const checkDatabase = async (): Promise<'up' | 'down'> => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return 'up'
  } catch (err) {
    logger.error({ err }, 'healthcheck do banco falhou')
    return 'down'
  }
}
