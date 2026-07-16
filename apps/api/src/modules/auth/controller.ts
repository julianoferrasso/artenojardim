import type { Request, Response } from 'express'
import type { LoginInput } from '@ecommerce/shared/contracts'
import { ROUTES } from '@ecommerce/shared/constants'
import { env, isProduction } from '../../config/env.js'
import { ok } from '../../shared/http.js'
import { unauthorized } from '../../shared/errors.js'
import * as service from './service.js'

/**
 * Nome distinto do cookie de cliente (Fase 1): staff e cliente têm sessões
 * independentes, e um navegador pode ter as duas ao mesmo tempo — o dono da loja
 * comprando na própria loja.
 */
const STAFF_REFRESH_COOKIE = 'staff_refresh_token'

const cookieOptions = () =>
  ({
    httpOnly: true,
    // Sem TLS em dev; obrigatório em produção — senão o cookie viaja em claro.
    secure: isProduction,
    sameSite: 'lax' as const,
    domain: env.COOKIE_DOMAIN,
    // Restrito ao endpoint de refresh: o cookie nem é enviado nas outras rotas,
    // então uma falha de XSS em qualquer outro lugar não o alcança.
    path: ROUTES.auth.admin.refresh,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400 * 1000,
  }) as const

const sessionContext = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get('user-agent'),
})

export const loginController = async (req: Request, res: Response): Promise<void> => {
  const result = await service.loginStaff(req.body as LoginInput, sessionContext(req))

  res.cookie(STAFF_REFRESH_COOKIE, result.refreshToken, cookieOptions())

  // O refresh token NÃO vai no corpo: ele vive só no cookie HttpOnly, fora do
  // alcance do JS. Devolvê-lo aqui anularia a proteção inteira.
  ok(res, {
    user: result.user,
    tokens: { accessToken: result.accessToken, expiresIn: result.expiresIn },
  })
}

export const refreshController = async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.[STAFF_REFRESH_COOKIE] as string | undefined
  if (!token) throw unauthorized('Sessão não encontrada')

  const result = await service.refreshStaffSession(token, sessionContext(req))

  res.cookie(STAFF_REFRESH_COOKIE, result.refreshToken, cookieOptions())
  ok(res, {
    user: result.user,
    tokens: { accessToken: result.accessToken, expiresIn: result.expiresIn },
  })
}

export const logoutController = async (req: Request, res: Response): Promise<void> => {
  await service.logoutStaff(req.cookies?.[STAFF_REFRESH_COOKIE] as string | undefined)

  // clearCookie precisa dos MESMOS domain/path do set, senão o browser não
  // encontra o cookie e ele fica no navegador para sempre.
  const { maxAge: _maxAge, ...clearOptions } = cookieOptions()
  res.clearCookie(STAFF_REFRESH_COOKIE, clearOptions)

  ok(res, { success: true })
}

export const meController = async (req: Request, res: Response): Promise<void> => {
  ok(res, { user: await service.getStaffProfile(req.auth!.sub) })
}
