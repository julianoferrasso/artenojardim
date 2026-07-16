import type { Request, Response } from 'express'
import { checkDatabase } from '../../config/prisma.js'
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

  res.status(status)
  ok(res, {
    status: 'ok' as const,
    version: VERSION,
    uptime: Math.floor(process.uptime()),
    database,
  })
}
