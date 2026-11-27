'use client'

import { ROUTES } from '@ecommerce/shared/constants'
import type {
  AuthCustomer,
  ChangeEmailInput,
  ChangePasswordInput,
  CustomerSessionItem,
  DeleteAccountInput,
  EmailCodeSent,
  ForgotPasswordInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateCustomerProfileInput,
  VerifyEmailCodeInput,
} from '@ecommerce/shared/contracts'
import { clientFetch } from './client'
import type { SessionResp } from './auth'

/**
 * Chamadas de conta que acontecem FORA de uma sessão: cadastro, código e link de
 * confirmação, recuperação de senha.
 *
 * Não moram em `auth.tsx`: as que devolvem sessão (código, link) só a DEVOLVEM —
 * quem chama decide quando aplicá-la com `applySession`, depois do que mais
 * precisar fazer (o checkout, por exemplo, guarda a escolha de frete antes).
 */

const post = <T>(path: string, body: unknown): Promise<T> =>
  clientFetch<T>(path, { method: 'POST', body: JSON.stringify(body) })

export type RegisterResult = { emailVerificationRequired: true; email: string; resendInSeconds: number }

/** Cria a conta. Não loga e não leva a senha: devolve o e-mail para a tela pedir o código. */
export const registerAccount = (input: RegisterInput): Promise<RegisterResult> =>
  post<RegisterResult>(ROUTES.auth.register, input)

/** Consome o link do cadastro. Devolve SESSÃO: confirmar é entrar. */
export const verifyEmail = (token: string): Promise<SessionResp> =>
  post<SessionResp>(ROUTES.auth.verifyEmail, { token })

/** Manda um código de 6 dígitos para o e-mail. Mesma resposta para cliente e não cliente. */
export const requestEmailCode = (email: string): Promise<EmailCodeSent> =>
  post<EmailCodeSent>(ROUTES.auth.requestEmailCode, { email })

/**
 * Confere o código e devolve SESSÃO — criando a conta se o e-mail não tiver uma
 * (aí o `name` é obrigatório: sem ele vem NAME_REQUIRED e o código segue valendo).
 * O carrinho anônimo deste navegador é mesclado na mesma resposta.
 */
export const verifyEmailCode = (input: VerifyEmailCodeInput): Promise<SessionResp> =>
  post<SessionResp>(ROUTES.auth.verifyEmailCode, input)

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
 * Troca a senha sabendo a atual — ou cria a PRIMEIRA, sem `currentPassword`, em
 * conta que nasceu pelo código. Devolve uma sessão NOVA: a API revogou as
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
