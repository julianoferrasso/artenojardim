import type { Request, Response } from 'express'
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from '@ecommerce/shared/contracts'
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

const respond = (res: Response, result: service.CustomerSession) => {
  res.cookie(CUSTOMER_REFRESH_COOKIE, result.refreshToken, cookieOptions())
  ok(res, {
    customer: result.customer,
    tokens: { accessToken: result.accessToken, expiresIn: result.expiresIn },
  })
}

/**
 * Cadastro não devolve sessão nem cookie: a conta só entra depois da confirmação
 * por e-mail. O `email` volta para a tela dizer "enviamos para ..." e oferecer o
 * reenvio sem pedir o endereço de novo.
 */
export const registerController = async (req: Request, res: Response): Promise<void> => {
  const result = await service.registerCustomer(req.body as RegisterInput, sessionContext(req))
  created(res, { emailVerificationRequired: true, email: result.email })
}

export const verifyEmailController = async (req: Request, res: Response): Promise<void> => {
  const { token } = req.body as VerifyEmailInput
  await service.verifyCustomerEmail(token, sessionContext(req))
  ok(res, { verified: true })
}

/** Sempre 200: revelar se o e-mail existe seria enumerar a base de clientes. */
export const resendVerificationController = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as ResendVerificationInput
  await service.resendVerification(email, sessionContext(req))
  ok(res, { success: true })
}

/** Idem: a resposta é idêntica para e-mail cadastrado e desconhecido. */
export const forgotPasswordController = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as ForgotPasswordInput
  await service.requestPasswordReset(email, sessionContext(req))
  ok(res, { success: true })
}

/**
 * Não emite sessão de propósito: o reset acabou de revogar todas as sessões do
 * cliente, e logar aqui contradiria o próprio ato. Ele entra com a senha nova.
 */
export const resetPasswordController = async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body as ResetPasswordInput
  await service.resetCustomerPassword(token, password, sessionContext(req))
  ok(res, { success: true })
}

export const loginController = async (req: Request, res: Response): Promise<void> => {
  respond(res, await service.loginCustomer(req.body as LoginInput, sessionContext(req)))
}

export const refreshController = async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.[CUSTOMER_REFRESH_COOKIE] as string | undefined
  if (!token) throw unauthorized('Sessão não encontrada')
  respond(res, await service.refreshCustomerSession(token, sessionContext(req)))
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
