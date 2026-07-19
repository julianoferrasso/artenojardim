import { rateLimit, type Store, type ClientRateLimitInfo, type Options } from 'express-rate-limit'
import type { Request, RequestHandler } from 'express'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'
import { isTest } from '../config/env.js'

/**
 * Store no Postgres, não em memória.
 *
 * Com `pm2 cluster` de 4 instâncias, um contador em memória vive por processo:
 * o limite real vira 4x o configurado, e quem faz brute force simplesmente cai
 * na instância que ainda tem folga. O contador precisa ser compartilhado.
 *
 * Não usamos Redis porque há uma VPS e o Postgres já está lá, com backup e
 * monitoramento. Trocar quando houver uma segunda VPS — só este arquivo muda.
 */
const createPostgresStore = (windowMs: number): Store => ({
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const expiresAt = new Date(Date.now() + windowMs)

    // Um UPSERT atômico, e não SELECT-depois-UPDATE: entre a leitura e a escrita
    // cabem dez requisições do atacante. Aqui o Postgres arbitra, sob o lock da
    // linha. O CASE reinicia a janela quando ela já expirou, em vez de exigir
    // um job de limpeza no caminho crítico.
    const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
      INSERT INTO "RateLimit" ("key", "count", "expiresAt")
      VALUES (${key}, 1, ${expiresAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count"     = CASE WHEN "RateLimit"."expiresAt" < now() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "expiresAt" = CASE WHEN "RateLimit"."expiresAt" < now() THEN ${expiresAt} ELSE "RateLimit"."expiresAt" END
      RETURNING "count", "expiresAt"
    `

    const row = rows[0]
    if (!row) throw new Error('rate limit: upsert não retornou linha')

    return { totalHits: row.count, resetTime: row.expiresAt }
  },

  async decrement(key: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE "RateLimit" SET "count" = GREATEST("count" - 1, 0) WHERE "key" = ${key}
    `
  },

  async resetKey(key: string): Promise<void> {
    await prisma.rateLimit.deleteMany({ where: { key } })
  },
})

const handler: Options['handler'] = (req, res, _next, options) => {
  logger.warn({ ip: req.ip, path: req.path }, 'rate limit atingido')
  res.status(options.statusCode).json({
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      requestId: req.requestId,
    },
  })
}

type LimiterConfig = {
  name: string
  windowMs: number
  max: number
  /** Escopo do contador. Sem isto, o limite é por IP. */
  keyBy?: (req: Request) => string
}

const build = ({ name, windowMs, max, keyBy }: LimiterConfig): RequestHandler =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: createPostgresStore(windowMs),
    handler,
    // O prefixo evita que dois limitadores diferentes compartilhem contador para
    // o mesmo IP — sem ele, errar o login consumiria a cota do checkout.
    keyGenerator: (req) => `${name}:${keyBy ? keyBy(req) : (req.ip ?? 'unknown')}`,
    skip: () => isTest,
  })

/** Barreira geral. O Nginx tem a dele na frente — bloquear lá custa 1000x menos. */
export const globalLimiter = build({ name: 'global', windowMs: 15 * 60_000, max: 300 })

/**
 * Por IP **e** e-mail: só por IP, um atacante atrás de CGNAT bloqueia usuários
 * legítimos; só por e-mail, ele varre e-mails à vontade de um único IP.
 * O e-mail entra normalizado — senão `A@x.com` e `a@x.com` seriam cotas distintas.
 */
export const loginLimiter = build({
  name: 'login',
  windowMs: 15 * 60_000,
  max: 5,
  keyBy: (req) => {
    const email = (req.body as { email?: string })?.email?.toLowerCase().trim() ?? ''
    return `${req.ip}:${email}`
  },
})

export const refreshLimiter = build({ name: 'refresh', windowMs: 15 * 60_000, max: 60 })

export const registerLimiter = build({ name: 'register', windowMs: 60 * 60_000, max: 3 })

export const forgotPasswordLimiter = build({
  name: 'forgot',
  windowMs: 60 * 60_000,
  max: 3,
  keyBy: (req) => (req.body as { email?: string })?.email?.toLowerCase().trim() ?? (req.ip ?? ''),
})

/**
 * Cotação de frete: cada chamada bate no Melhor Envio (custo e latência de 1–3s).
 * Público (loja anônima cota no produto), então o limite protege a nossa cota na
 * API deles contra abuso.
 */
export const shippingQuoteLimiter = build({ name: 'shipping-quote', windowMs: 60 * 60_000, max: 60 })

/** Confirmar pedido cria Order + reserva estoque: limita abuso por IP. */
export const checkoutConfirmLimiter = build({ name: 'checkout-confirm', windowMs: 60 * 60_000, max: 20 })
