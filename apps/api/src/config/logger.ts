import { pino } from 'pino'
import { env, isProduction, isTest } from './env.js'

/**
 * Redação configurada no dia um, não depois do primeiro vazamento.
 * Log vai para arquivo, para o Sentry, para o terminal de quem der suporte —
 * lugares onde ninguém planejou que uma senha aparecesse.
 */
const redact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
    'password',
    '*.password',
    'passwordHash',
    '*.passwordHash',
    'token',
    '*.token',
    'accessToken',
    '*.accessToken',
    'refreshToken',
    '*.refreshToken',
    'tokenHash',
    '*.tokenHash',
    'document',
    '*.document',
    'card',
    '*.card',
    'cvc',
    '*.cvc',
  ],
  censor: '[redacted]',
}

export const logger = pino({
  level: isTest ? 'silent' : isProduction ? 'info' : 'debug',
  redact,
  // JSON puro em produção (parseável); legível em desenvolvimento.
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
  base: { env: env.NODE_ENV },
})

export type Logger = typeof logger
