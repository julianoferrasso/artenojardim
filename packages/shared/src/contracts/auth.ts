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
