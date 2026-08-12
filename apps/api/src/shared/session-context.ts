import type { Request } from 'express'
import type { SessionContext } from './refresh-tokens.js'

/**
 * IP e user-agent da requisição, no formato que a mecânica de sessão e a
 * auditoria esperam.
 *
 * Vive aqui e não em cada controller porque três deles precisam do mesmo objeto
 * (auth de cliente, perfil e confirmação de troca de e-mail) — e a terceira
 * cópia é onde uma delas deixa de mandar o `userAgent` sem ninguém notar.
 */
export const sessionContext = (req: Request): SessionContext => ({
  ip: req.ip,
  userAgent: req.get('user-agent'),
})
