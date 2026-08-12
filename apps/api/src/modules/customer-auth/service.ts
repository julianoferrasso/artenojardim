import {
  ERROR_CODES,
  type AuthCustomer,
  type LoginInput,
  type RegisterInput,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { prisma } from '../../config/prisma.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { appError, conflict, unauthorized } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit } from '../../shared/audit.js'
import { getEmailBranding } from '../../shared/email-branding.js'
import { hashPassword, verifyPassword, dummyVerify } from '../../utils/crypto.js'
import { renderResetPassword, renderVerifyEmail, sendEmailSafe } from '../../integrations/email/index.js'
import { signAccessToken, ttlToSeconds } from '../auth/domain/tokens.js'
import {
  issueRefreshToken,
  validateAndRotate,
  revokeToken,
  revokeAllSessions,
  type SessionContext,
} from '../../shared/refresh-tokens.js'
import {
  consumeCustomerToken,
  findValidCustomerToken,
  issueCustomerToken,
} from './tokens.js'

/**
 * Auth de CLIENTE. Fluxo independente do staff: usa Customer (não User), os
 * segredos JWT_CUSTOMER_*, e o cookie de cliente. A mecânica de refresh vem de
 * shared/refresh-tokens (a mesma do staff, parametrizada) — só o que difere por
 * entidade mora aqui.
 *
 * O e-mail do cliente é VERIFICADO antes de a conta funcionar: quem se cadastra
 * não recebe sessão, recebe um link. É por isso que `registerCustomer` não
 * devolve `CustomerSession` como o login.
 */

export type CustomerSession = {
  customer: AuthCustomer
  accessToken: string
  expiresIn: number
  refreshToken: string
}

/** Campos mínimos de todo `select` de customer — `emailVerifiedAt` inclusive,
 *  que o contrato exige como `emailVerified`. */
const AUTH_SELECT = { id: true, name: true, email: true, emailVerifiedAt: true } as const

const issueAccess = (customerId: string): Promise<string> =>
  signAccessToken(
    { sub: customerId, type: 'customer', storeId: getActiveStoreId() },
    env.JWT_CUSTOMER_ACCESS_SECRET,
    env.ACCESS_TOKEN_TTL,
  )

const toAuthCustomer = (c: {
  id: string
  name: string
  email: string
  emailVerifiedAt: Date | null
}): AuthCustomer => ({
  id: c.id,
  name: c.name,
  email: c.email,
  emailVerified: c.emailVerifiedAt !== null,
})

const verificationTtlMs = (): number => env.EMAIL_VERIFICATION_TTL_HOURS * 3600 * 1000
const resetTtlMs = (): number => env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000

/**
 * Emite o token e manda o e-mail de confirmação. NUNCA lança: é chamada de dentro
 * do cadastro, e uma falha de e-mail não pode transformar uma conta criada com
 * sucesso num 500. O cliente sempre tem a saída do "reenviar".
 *
 * Quando existir a fila (roadmap §14), o corpo daqui vira um publish.
 */
const dispatchVerificationEmail = async (
  customer: { id: string; name: string; email: string },
  ctx: SessionContext,
): Promise<void> => {
  try {
    const [{ token, confirmDelivery }, branding] = await Promise.all([
      issueCustomerToken({
        customerId: customer.id,
        purpose: 'EMAIL_VERIFICATION',
        ttlMs: verificationTtlMs(),
        ctx,
      }),
      getEmailBranding(),
    ])

    const content = renderVerifyEmail({
      branding,
      customerName: customer.name,
      // O token vai na query string e é limpo da URL pelo front assim que lido.
      verifyUrl: `${branding.storeUrl}/entrar/verificar-email?token=${encodeURIComponent(token)}`,
      expiresInHours: env.EMAIL_VERIFICATION_TTL_HOURS,
    })

    const sent = await sendEmailSafe({
      ...content,
      to: customer.email,
      tags: { template: 'verify_email' },
    })

    // Só aposenta os links anteriores se este de fato saiu.
    if (sent) await confirmDelivery()
  } catch (err) {
    // Sem o customerId no log não há como socorrer quem ficou sem o e-mail.
    // A URL, essa, nunca entra no log: o token cru está nela.
    logger.error({ err, customerId: customer.id }, 'não foi possível enviar a confirmação de e-mail')
  }
}

export type RegisterResult = { email: string }

/**
 * Cadastro. NÃO devolve sessão: a conta só entra depois que o cliente clica no
 * link enviado por e-mail. O visitante que só quer comprar continua tendo o guest
 * checkout, que não exige conta nenhuma.
 */
export const registerCustomer = async (
  input: RegisterInput,
  ctx: SessionContext,
): Promise<RegisterResult> => {
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

  // Sobre uma conta de guest checkout, grava a senha mas NÃO toca no `name`: até
  // a confirmação do e-mail, quem cadastrou é só alguém que digitou um endereço
  // alheio. Deixar o nome ser reescrito aqui permitiria trocar o nome que aparece
  // nos pedidos já feitos, sem provar posse de nada. O nome do formulário passa a
  // valer quando ele confirmar o e-mail.
  const customer = existing
    ? await prisma.customer.update({
        where: { id: existing.id },
        data: { passwordHash, pendingName: input.name },
        select: { id: true, name: true, email: true },
      })
    : await prisma.customer.create({
        data: { storeId, name: input.name, email: input.email, passwordHash },
        select: { id: true, name: true, email: true },
      })

  await audit({
    action: EVENTS.customer.registered,
    entityType: 'Customer',
    entityId: customer.id,
    context: { ip: ctx.ip, userAgent: ctx.userAgent },
  })

  await dispatchVerificationEmail(customer, ctx)

  return { email: customer.email }
}

/**
 * Reenvio da confirmação. Responde igual para e-mail inexistente, já verificado
 * ou sem conta — quem pede o reenvio não pode descobrir quem tem cadastro aqui.
 */
export const resendVerification = async (email: string, ctx: SessionContext): Promise<void> => {
  const customer = await prisma.customer.findUnique({
    where: { storeId_email: { storeId: getActiveStoreId(), email } },
    select: { id: true, name: true, email: true, emailVerifiedAt: true, deletedAt: true },
  })

  if (!customer || customer.emailVerifiedAt || customer.deletedAt) return

  await dispatchVerificationEmail(customer, ctx)
}

/** Consome o link e marca o e-mail como confirmado. Idempotente só até o consumo:
 *  reabrir o mesmo link depois responde link inválido, e é isso que prova o single-use. */
export const verifyCustomerEmail = async (token: string, ctx: SessionContext): Promise<void> => {
  const stored = await findValidCustomerToken(token, 'EMAIL_VERIFICATION')

  await prisma.$transaction(async (tx) => {
    await consumeCustomerToken(tx, stored.id)

    // Agora sim o nome do cadastro vale: a posse da caixa está provada.
    const current = await tx.customer.findUniqueOrThrow({
      where: { id: stored.customerId },
      select: { pendingName: true },
    })

    await tx.customer.update({
      where: { id: stored.customerId },
      data: {
        emailVerifiedAt: new Date(),
        ...(current.pendingName ? { name: current.pendingName, pendingName: null } : {}),
      },
    })
  })

  await audit({
    action: EVENTS.customer.emailVerified,
    entityType: 'Customer',
    entityId: stored.customerId,
    context: { ip: ctx.ip, userAgent: ctx.userAgent },
  })
}

export const loginCustomer = async (
  input: LoginInput,
  ctx: SessionContext,
): Promise<CustomerSession> => {
  const storeId = getActiveStoreId()

  const customer = await prisma.customer.findUnique({
    where: { storeId_email: { storeId, email: input.email } },
    select: { ...AUTH_SELECT, passwordHash: true, deletedAt: true },
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

  // DEPOIS de conferir a senha, nunca antes: recusar por falta de verificação
  // sem checar a senha diria a qualquer um se este e-mail tem conta aqui.
  if (!customer.emailVerifiedAt) {
    throw appError(
      ERROR_CODES.EMAIL_NOT_VERIFIED,
      'Confirme o seu e-mail para entrar. Verifique a sua caixa de entrada.',
      403,
    )
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
    select: AUTH_SELECT,
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
    select: AUTH_SELECT,
  })
  if (!customer) throw unauthorized('Sessão inválida')
  return toAuthCustomer(customer)
}

/**
 * Pedido de recuperação de senha. Sempre "sucesso" para quem chamou — conta
 * inexistente, apagada ou sem senha respondem igual. É o que impede usar esta
 * rota para descobrir quem é cliente da loja.
 *
 * Cliente de guest checkout (sem `passwordHash`) TAMBÉM recebe o link: para ele,
 * "redefinir" é definir a primeira senha e assumir o histórico de pedidos.
 */
export const requestPasswordReset = async (email: string, ctx: SessionContext): Promise<void> => {
  const customer = await prisma.customer.findUnique({
    where: { storeId_email: { storeId: getActiveStoreId(), email } },
    select: { id: true, name: true, email: true, deletedAt: true },
  })

  if (!customer || customer.deletedAt) return

  try {
    const [{ token, confirmDelivery }, branding] = await Promise.all([
      issueCustomerToken({
        customerId: customer.id,
        purpose: 'PASSWORD_RESET',
        ttlMs: resetTtlMs(),
        ctx,
      }),
      getEmailBranding(),
    ])

    const content = renderResetPassword({
      branding,
      customerName: customer.name,
      resetUrl: `${branding.storeUrl}/entrar/redefinir-senha?token=${encodeURIComponent(token)}`,
      expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
    })

    const sent = await sendEmailSafe({
      ...content,
      to: customer.email,
      tags: { template: 'reset_password' },
    })

    if (sent) await confirmDelivery()
  } catch (err) {
    // A resposta já é genérica por decisão de segurança: falhar aqui devolveria
    // um 500 que, por contraste com o 200 do e-mail inexistente, entregaria
    // justamente a informação que a resposta genérica esconde.
    logger.error({ err, customerId: customer.id }, 'falha ao enviar o e-mail de recuperação')
  }
}

/**
 * Troca a senha pelo link do e-mail.
 *
 * Tudo numa transação: consumir o token, gravar a senha e derrubar as sessões.
 * Se a revogação ficasse de fora e falhasse, a senha nova valeria com a sessão
 * do invasor ainda viva — que é exatamente o cenário que este fluxo existe para
 * resolver.
 */
export const resetCustomerPassword = async (
  token: string,
  password: string,
  ctx: SessionContext,
): Promise<void> => {
  const stored = await findValidCustomerToken(token, 'PASSWORD_RESET')
  const passwordHash = await hashPassword(password)

  await prisma.$transaction(async (tx) => {
    await consumeCustomerToken(tx, stored.id)

    await tx.customer.update({
      where: { id: stored.customerId },
      data: {
        passwordHash,
        // Clicar no link provou posse da caixa. Para quem estava travado sem
        // confirmar, este é o segundo caminho de entrada — e evita o beco sem
        // saída de "recuperei a senha mas continuo sem conseguir entrar".
        emailVerifiedAt: new Date(),
      },
    })

    await revokeAllSessions({ kind: 'customer', id: stored.customerId }, tx)
  })

  await audit({
    action: EVENTS.customer.passwordReset,
    entityType: 'Customer',
    entityId: stored.customerId,
    context: { ip: ctx.ip, userAgent: ctx.userAgent },
  })
}
