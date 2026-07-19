import type { Request, Response } from 'express'
import type { LoginInput, RegisterInput } from '@ecommerce/shared/contracts'
import { ROUTES } from '@ecommerce/shared/constants'
import { env, isProduction } from '../../config/env.js'
import { ok, created } from '../../shared/http.js'
import { unauthorized } from '../../shared/errors.js'
import * as service from './service.js'

/**
 * Cookie de CLIENTE — nome distinto do de staff. Um mesmo navegador pode ter as
 * duas sessões (o dono da loja comprando na própria loja), e elas não se cruzam.
 */
const CUSTOMER_REFRESH_COOKIE = 'customer_refresh_token'

const cookieOptions = () =>
  ({
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    domain: env.COOKIE_DOMAIN,
    // Restrito ao endpoint de refresh de cliente: nem é enviado nas outras rotas.
    path: ROUTES.auth.refresh,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400 * 1000,
  }) as const

const sessionContext = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') })

const respond = (res: Response, result: Awaited<ReturnType<typeof service.loginCustomer>>, status: 200 | 201) => {
  res.cookie(CUSTOMER_REFRESH_COOKIE, result.refreshToken, cookieOptions())
  const body = {
    customer: result.customer,
    tokens: { accessToken: result.accessToken, expiresIn: result.expiresIn },
  }
  status === 201 ? created(res, body) : ok(res, body)
}

export const registerController = async (req: Request, res: Response): Promise<void> => {
  respond(res, await service.registerCustomer(req.body as RegisterInput, sessionContext(req)), 201)
}

export const loginController = async (req: Request, res: Response): Promise<void> => {
  respond(res, await service.loginCustomer(req.body as LoginInput, sessionContext(req)), 200)
}

export const refreshController = async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.[CUSTOMER_REFRESH_COOKIE] as string | undefined
  if (!token) throw unauthorized('Sessão não encontrada')
  respond(res, await service.refreshCustomerSession(token, sessionContext(req)), 200)
}

export const logoutController = async (req: Request, res: Response): Promise<void> => {
  await service.logoutCustomer(req.cookies?.[CUSTOMER_REFRESH_COOKIE] as string | undefined)
  const { maxAge: _maxAge, ...clearOptions } = cookieOptions()
  res.clearCookie(CUSTOMER_REFRESH_COOKIE, clearOptions)
  ok(res, { success: true })
}

export const meController = async (req: Request, res: Response): Promise<void> => {
  ok(res, { customer: await service.getCustomerProfile(req.auth!.sub) })
}
