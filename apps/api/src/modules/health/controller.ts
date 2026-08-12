import type { Request, Response } from 'express'
import { checkDatabase } from '../../config/prisma.js'
import { isRabbitUp } from '../../config/rabbitmq.js'
import { isQueueConfigured } from '../../config/env.js'
import { ok } from '../../shared/http.js'

const VERSION = process.env['npm_package_version'] ?? '0.1.0'

/**
 * Módulo sem service, sem repository, sem schemas: não há regra de negócio nem
 * entrada para validar. É a regra "crie só o arquivo que tem trabalho a fazer"
 * na prática.
 */
export const healthController = async (_req: Request, res: Response): Promise<void> => {
  const database = await checkDatabase()

  // 503 com banco fora é o que faz o PM2 e o Nginx enxergarem a instância como
  // ruim. Devolver 200 aqui é ter healthcheck decorativo.
  const status = database === 'up' ? 200 : 503

  // A fila NÃO entra no status HTTP, de propósito: sem broker a loja continua
  // vendendo, e derrubar a instância por causa disso trocaria "campanha atrasada"
  // por "loja fora do ar". Aparece no corpo para o problema ser visível antes de
  // virar "o e-mail do pedido não chegou".
  const queue = !isQueueConfigured() ? ('off' as const) : isRabbitUp() ? ('up' as const) : ('down' as const)

  res.status(status)
  ok(res, {
    status: 'ok' as const,
    version: VERSION,
    uptime: Math.floor(process.uptime()),
    database,
    queue,
  })
}
