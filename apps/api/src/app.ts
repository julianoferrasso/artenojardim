import express, { type Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env, isProduction } from './config/env.js'
import { requestContext } from './middlewares/request-context.js'
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js'
import { globalLimiter } from './middlewares/rate-limit.js'
import { apiRoutes, API_PREFIX } from './routes.js'

export const createApp = (): Express => {
  const app = express()

  // Nginx é quem termina o TLS. Sem isso, req.ip é o do proxy (127.0.0.1) e o
  // rate limit passa a contar o mundo inteiro como um único cliente.
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.use(helmet())

  // Allowlist explícita. `origin: '*'` com credentials o browser recusa — e a
  // tentativa de contornar isso é sinal de que se está fazendo errado.
  app.use(
    cors({
      origin: [env.STORE_URL, env.ADMIN_URL],
      credentials: true,
      maxAge: 86400,
    }),
  )

  app.use(requestContext)

  // ── Webhooks vêm ANTES do parser de JSON ───────────────────────────────────
  // A verificação de assinatura do Stripe precisa do corpo CRU, byte a byte.
  // Se o express.json() correr primeiro, o corpo vira objeto, a assinatura não
  // confere e todo webhook falha. Fase 1 monta a rota aqui.
  // app.use(ROUTES.webhooks.stripe, express.raw({ type: 'application/json' }), stripeWebhookRoutes)

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))
  app.use(cookieParser())

  // Serve ./uploads apenas com o driver local. Em produção quem serve é o R2 via
  // CDN, e esta rota não existe.
  if (env.STORAGE_DRIVER === 'local' && !isProduction) {
    app.use('/uploads', express.static(env.LOCAL_UPLOAD_DIR, { maxAge: '1h' }))
  }

  // Depois do body parser (o limitador de login precisa ler req.body.email) e
  // antes das rotas. /health fica de fora: um monitor batendo de minuto em
  // minuto não pode consumir a cota, e derrubar o healthcheck por rate limit
  // faria o PM2 achar que a instância morreu.
  app.use(API_PREFIX, (req, res, next) => {
    if (req.path === '/health') return next()
    globalLimiter(req, res, next)
  })

  app.use(API_PREFIX, apiRoutes)

  app.use(notFoundHandler)

  // Por último, sempre: o Express identifica o error handler pela aridade (4
  // argumentos) e só o chama se estiver registrado depois de todas as rotas.
  app.use(errorHandler)

  return app
}
