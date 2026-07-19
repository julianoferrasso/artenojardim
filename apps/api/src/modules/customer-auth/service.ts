import {
  ERROR_CODES,
  type AuthCustomer,
  type LoginInput,
  type RegisterInput,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { prisma } from '../../config/prisma.js'
import { env } from '../../config/env.js'
import { appError, conflict, unauthorized } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit } from '../../shared/audit.js'
import { hashPassword, verifyPassword, dummyVerify } from '../../utils/crypto.js'
import { signAccessToken, ttlToSeconds } from '../auth/domain/tokens.js'
import {
  issueRefreshToken,
  validateAndRotate,
  revokeToken,
  type SessionContext,
} from '../../shared/refresh-tokens.js'

/**
 * Auth de CLIENTE. Fluxo independente do staff: usa Customer (não User), os
 * segredos JWT_CUSTOMER_*, e o cookie de cliente. A mecânica de refresh vem de
 * shared/refresh-tokens (a mesma do staff, parametrizada) — só o que difere por
 * entidade mora aqui.
 */

export type CustomerSession = {
  customer: AuthCustomer
  accessToken: string
  expiresIn: number
  refreshToken: string
}

const issueAccess = (customerId: string): Promise<string> =>
  signAccessToken(
    { sub: customerId, type: 'customer', storeId: getActiveStoreId() },
    env.JWT_CUSTOMER_ACCESS_SECRET,
    env.ACCESS_TOKEN_TTL,
  )

const toAuthCustomer = (c: { id: string; name: string; email: string }): AuthCustomer => ({
  id: c.id,
  name: c.name,
  email: c.email,
})

export const registerCustomer = async (
  input: RegisterInput,
  ctx: SessionContext,
): Promise<CustomerSession> => {
  const storeId = getActiveStoreId()

  // O guest checkout (Fase 1.11) pode ter criado o cliente SEM senha. Registrar
  // com o mesmo e-mail então "assume" a conta, definindo a senha — em vez de
  // recusar por e-mail duplicado, o que confundiria quem já comprou como convidado.
  const existing = await prisma.customer.findUnique({
    where: { storeId_email: { storeId, email: input.email } },
    select: { id: true, passwordHash: true },
  })

  if (existing?.passwordHash) {
    throw conflict('Já existe uma conta com este e-mail.', ERROR_CODES.EMAIL_ALREADY_EXISTS)
  }

  const passwordHash = await hashPassword(input.password)

  const customer = existing
    ? await prisma.customer.update({
        where: { id: existing.id },
        data: { passwordHash, name: input.name },
        select: { id: true, name: true, email: true },
      })
    : await prisma.customer.create({
        data: { storeId, name: input.name, email: input.email, passwordHash },
        select: { id: true, name: true, email: true },
      })

  const [accessToken, refreshToken] = await Promise.all([
    issueAccess(customer.id),
    issueRefreshToken({ kind: 'customer', id: customer.id }, ctx),
  ])

  await audit({
    action: EVENTS.customer.registered,
    entityType: 'Customer',
    entityId: customer.id,
    context: { ip: ctx.ip, userAgent: ctx.userAgent },
  })

  return {
    customer: toAuthCustomer(customer),
    accessToken,
    expiresIn: ttlToSeconds(env.ACCESS_TOKEN_TTL),
    refreshToken,
  }
}

export const loginCustomer = async (
  input: LoginInput,
  ctx: SessionContext,
): Promise<CustomerSession> => {
  const storeId = getActiveStoreId()

  const customer = await prisma.customer.findUnique({
    where: { storeId_email: { storeId, email: input.email } },
    select: { id: true, name: true, email: true, passwordHash: true, deletedAt: true },
  })

  // Gasta o mesmo tempo de um argon2 real quando a conta não existe OU não tem
  // senha (guest sem senha) — fecha enumeração de e-mail por timing.
  if (!customer?.passwordHash) {
    await dummyVerify()
    throw appError(ERROR_CODES.INVALID_CREDENTIALS, 'E-mail ou senha inválidos', 401)
  }

  if (!(await verifyPassword(customer.passwordHash, input.password))) {
    throw appError(ERROR_CODES.INVALID_CREDENTIALS, 'E-mail ou senha inválidos', 401)
  }

  if (customer.deletedAt) {
    throw appError(ERROR_CODES.ACCOUNT_DISABLED, 'Conta indisponível.', 403)
  }

  const [accessToken, refreshToken] = await Promise.all([
    issueAccess(customer.id),
    issueRefreshToken({ kind: 'customer', id: customer.id }, ctx),
  ])

  return {
    customer: toAuthCustomer(customer),
    accessToken,
    expiresIn: ttlToSeconds(env.ACCESS_TOKEN_TTL),
    refreshToken,
  }
}

export const refreshCustomerSession = async (
  rawToken: string,
  ctx: SessionContext,
): Promise<CustomerSession> => {
  const { principal, rotate } = await validateAndRotate(rawToken, ctx, 'customer')

  const customer = await prisma.customer.findFirst({
    where: { id: principal.id, storeId: getActiveStoreId(), deletedAt: null },
    select: { id: true, name: true, email: true },
  })
  if (!customer) throw appError(ERROR_CODES.ACCOUNT_DISABLED, 'Conta indisponível.', 403)

  const [accessToken, refreshToken] = await Promise.all([issueAccess(customer.id), rotate()])

  return {
    customer: toAuthCustomer(customer),
    accessToken,
    expiresIn: ttlToSeconds(env.ACCESS_TOKEN_TTL),
    refreshToken,
  }
}

export const logoutCustomer = (rawToken: string | undefined): Promise<void> => revokeToken(rawToken)

export const getCustomerProfile = async (customerId: string): Promise<AuthCustomer> => {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId: getActiveStoreId(), deletedAt: null },
    select: { id: true, name: true, email: true },
  })
  if (!customer) throw unauthorized('Sessão inválida')
  return toAuthCustomer(customer)
}
