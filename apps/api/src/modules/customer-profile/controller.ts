import type { Request, Response } from 'express'
import type {
  ChangeEmailInput,
  ChangePasswordInput,
  DeleteAccountInput,
  UpdateCustomerProfileInput,
} from '@ecommerce/shared/contracts'
import { noContent, ok } from '../../shared/http.js'
import { sessionContext } from '../../shared/session-context.js'
import { CUSTOMER_REFRESH_COOKIE, cookieOptions, respondWithSession } from '../customer-auth/cookies.js'
import * as credentials from './credentials.js'
import * as service from './service.js'

export const updateController = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as UpdateCustomerProfileInput
  const customer = await service.updateCustomerProfile(req.auth!.sub, input)
  // Devolve o mesmo formato do /auth/me: o front aplica direto no contexto de
  // sessão, sem refazer a busca do perfil.
  ok(res, { customer })
}

/**
 * Responde como o login, com cookie e tokens novos: a troca revogou todas as
 * sessões, e sem uma sessão nova a aba atual seguiria com um access token
 * revogado — o cliente seria deslogado dois cliques depois de trocar a senha.
 */
export const changePasswordController = async (req: Request, res: Response): Promise<void> => {
  const session = await credentials.changeCustomerPassword(
    req.auth!.sub,
    req.body as ChangePasswordInput,
    sessionContext(req),
  )
  respondWithSession(res, session)
}

export const changeEmailController = async (req: Request, res: Response): Promise<void> => {
  const result = await credentials.requestEmailChange(
    req.auth!.sub,
    req.body as ChangeEmailInput,
    sessionContext(req),
  )
  ok(res, { pendingEmail: result.pendingEmail })
}

export const cancelEmailChangeController = async (req: Request, res: Response): Promise<void> => {
  await credentials.cancelEmailChange(req.auth!.sub)
  noContent(res)
}

export const listSessionsController = async (req: Request, res: Response): Promise<void> => {
  const sessions = await credentials.listCustomerSessions(req.auth!.sub, sessionContext(req))
  ok(res, { sessions })
}

/** Encerra as outras e reemite esta — por isso responde uma sessão, não 204. */
export const revokeSessionsController = async (req: Request, res: Response): Promise<void> => {
  const session = await credentials.revokeOtherSessions(req.auth!.sub, sessionContext(req))
  respondWithSession(res, session)
}

export const deleteAccountController = async (req: Request, res: Response): Promise<void> => {
  await credentials.deleteOwnAccount(
    req.auth!.sub,
    req.body as DeleteAccountInput,
    sessionContext(req),
  )
  // A conta acabou de ser anonimizada e as sessões revogadas: limpar o cookie
  // evita que a próxima chamada de refresh bata numa conta que não existe mais.
  // As opções vêm de cookies.ts (menos o maxAge, como no logout): o navegador só
  // apaga o cookie se `path` e `domain` baterem com os da gravação.
  const { maxAge: _maxAge, ...clearOptions } = cookieOptions()
  res.clearCookie(CUSTOMER_REFRESH_COOKIE, clearOptions)
  noContent(res)
}
