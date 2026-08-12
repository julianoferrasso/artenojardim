import { z } from 'zod'
import { emailSchema, passwordSchema } from './common.js'
import { userRoleSchema } from '../constants/enums.js'

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  name: z.string().min(2, 'Informe seu nome').max(120).trim(),
  email: emailSchema,
  password: passwordSchema,
})

export type RegisterInput = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({ email: emailSchema })

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
})

export const verifyEmailSchema = z.object({ token: z.string().min(1) })

export const resendVerificationSchema = z.object({ email: emailSchema })

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>

/**
 * Resposta do cadastro. NÃO traz sessão: a conta só entra depois que o cliente
 * clica no link enviado por e-mail. O `email` volta para a tela poder dizer
 * "enviamos para fulano@..." e oferecer o reenvio sem pedir de novo.
 */
export const registerResponseSchema = z.object({
  data: z.object({
    emailVerificationRequired: z.literal(true),
    email: z.string(),
  }),
})

/**
 * A resposta NÃO carrega o refresh token: ele vai em cookie HttpOnly, fora do
 * alcance do JS. `expiresIn` em segundos para o cliente agendar a renovação.
 */
export const authTokensSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
})

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: userRoleSchema,
})

export const authCustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  /// Derivado de `emailVerifiedAt`: o front não precisa da data, só do estado.
  emailVerified: z.boolean(),
  /// Vem junto da sessão para a tela de preferências abrir já no estado certo,
  /// sem um segundo request só para ler um booleano.
  acceptsMarketing: z.boolean(),
  /// Idem: `/conta/dados` abre com o telefone preenchido sem um GET extra. Um
  /// endpoint de perfil à parte criaria duas fontes de "quem é o cliente", e
  /// elas divergem no primeiro dia em que uma for atualizada e a outra não.
  phone: z.string().nullable(),
  /// E-mail aguardando confirmação, ou null. A tela precisa saber se há troca em
  /// curso para mostrar "aguardando" em vez do formulário.
  pendingEmail: z.string().nullable(),
  document: z.string().nullable(),
  /// `true` quando já existe pedido: o CPF virou dado fiscal e congelou. Vem
  /// derivado porque o front não pode decidir isso — quem sabe é o banco.
  documentLocked: z.boolean(),
})

export const adminLoginResponseSchema = z.object({
  data: z.object({
    user: authUserSchema,
    tokens: authTokensSchema,
  }),
})

export const customerLoginResponseSchema = z.object({
  data: z.object({
    customer: authCustomerSchema,
    tokens: authTokensSchema,
  }),
})

export type AuthUser = z.infer<typeof authUserSchema>
export type AuthCustomer = z.infer<typeof authCustomerSchema>
export type AuthTokens = z.infer<typeof authTokensSchema>
