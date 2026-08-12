'use client'

import { ROUTES } from '@ecommerce/shared/constants'
import type {
  ForgotPasswordInput,
  RegisterInput,
  ResetPasswordInput,
} from '@ecommerce/shared/contracts'
import { clientFetch } from './client'

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

export const forgotPassword = (input: ForgotPasswordInput): Promise<{ success: true }> =>
  post<{ success: true }>(ROUTES.auth.forgotPassword, input)

export const resetPassword = (input: ResetPasswordInput): Promise<{ success: true }> =>
  post<{ success: true }>(ROUTES.auth.resetPassword, input)
