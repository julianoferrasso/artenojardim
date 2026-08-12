'use client'

import { ROUTES } from '@ecommerce/shared/constants'
import type {
  AuthCustomer,
  ChangeEmailInput,
  ChangePasswordInput,
  CustomerSessionItem,
  DeleteAccountInput,
  ForgotPasswordInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateCustomerProfileInput,
} from '@ecommerce/shared/contracts'
import { clientFetch } from './client'
import type { SessionResp } from './auth'

/**
 * Chamadas de conta que acontecem FORA de uma sessão: confirmar e-mail, pedir e
 * concluir a recuperação de senha, e o cadastro (que hoje não emite sessão).
 *
 * Não moram em `auth.tsx` porque nenhuma delas mexe no estado de quem está
 * logado — o provider cuida da sessão, este arquivo cuida do e-mail.
 */

const post = <T>(path: string, body: unknown): Promise<T> =>
  clientFetch<T>(path, { method: 'POST', body: JSON.stringify(body) })

export type RegisterResult = { emailVerificationRequired: true; email: string }

/** Cria a conta. Não loga: devolve o e-mail para a tela pedir a confirmação. */
export const registerAccount = (input: RegisterInput): Promise<RegisterResult> =>
  post<RegisterResult>(ROUTES.auth.register, input)

export const verifyEmail = (token: string): Promise<{ verified: true }> =>
  post<{ verified: true }>(ROUTES.auth.verifyEmail, { token })

export const resendVerification = (email: string): Promise<{ success: true }> =>
  post<{ success: true }>(ROUTES.auth.resendVerification, { email })

/**
 * Descadastro pelo link do rodapé do e-mail. Sem sessão de propósito: quem
 * assinou pelo footer da loja nunca criou conta. O e-mail sai do token assinado,
 * no servidor — nada aqui diz de quem é o endereço.
 */
export const unsubscribe = (token: string): Promise<void> =>
  post<void>(ROUTES.newsletter.unsubscribe, { token })

export const forgotPassword = (input: ForgotPasswordInput): Promise<{ success: true }> =>
  post<{ success: true }>(ROUTES.auth.forgotPassword, input)

export const resetPassword = (input: ResetPasswordInput): Promise<{ success: true }> =>
  post<{ success: true }>(ROUTES.auth.resetPassword, input)

/** Atualiza o próprio cadastro. Devolve o perfil inteiro, para o AuthProvider
 *  aplicar sem refazer o /auth/me. */
export const updateProfile = (input: UpdateCustomerProfileInput): Promise<{ customer: AuthCustomer }> =>
  clientFetch<{ customer: AuthCustomer }>(ROUTES.customers.me, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })

/**
 * Troca a senha sabendo a atual. Devolve uma sessão NOVA: a API revogou as
 * outras, e quem provou a senha atual não deve ser deslogado da própria aba.
 *
 * Quem chama PRECISA aplicar o resultado com `applySession` — senão a aba fica
 * com um access token revogado e cai no próximo request.
 */
export const changePassword = (input: ChangePasswordInput): Promise<SessionResp> =>
  post<SessionResp>(ROUTES.customers.password, input)

/** Pede a troca de e-mail. NÃO altera nada: grava o pendente e manda os e-mails. */
export const requestEmailChange = (input: ChangeEmailInput): Promise<{ pendingEmail: string }> =>
  post<{ pendingEmail: string }>(ROUTES.customers.email, input)

export const cancelEmailChange = (): Promise<void> =>
  clientFetch<void>(ROUTES.customers.email, { method: 'DELETE' })

/** Consome o link da troca. Fora de sessão: quem clica costuma estar deslogado. */
export const confirmEmailChange = (token: string): Promise<{ changed: true }> =>
  post<{ changed: true }>(ROUTES.auth.confirmEmailChange, { token })

export const listSessions = (): Promise<{ sessions: CustomerSessionItem[] }> =>
  clientFetch<{ sessions: CustomerSessionItem[] }>(ROUTES.customers.sessions)

/** Encerra as outras sessões e reemite esta — daí devolver uma sessão. */
export const revokeOtherSessions = (): Promise<SessionResp> =>
  clientFetch<SessionResp>(ROUTES.customers.sessions, { method: 'DELETE' })

/** Exclusão da própria conta (LGPD). Irreversível. */
export const deleteAccount = (input: DeleteAccountInput): Promise<void> =>
  clientFetch<void>(ROUTES.customers.me, {
    method: 'DELETE',
    body: JSON.stringify(input),
  })
