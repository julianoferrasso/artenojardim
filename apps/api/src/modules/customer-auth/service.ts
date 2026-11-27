import {
  ERROR_CODES,
  type AuthCustomer,
  type LoginInput,
  type RegisterInput,
  type VerifyEmailCodeInput,
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
import { CODE_TTL_MS, RESEND_COOLDOWN_MS } from '../../utils/one-time-code.js'
import {
  renderEmailCode,
  renderResetPassword,
  renderVerifyEmail,
  sendEmailSafe,
} from '../../integrations/email/index.js'
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
import {
  checkEmailCode,
  consumeEmailCode,
  deleteEmailCodesCreatedBefore,
  emailCodeWaitMs,
  issueEmailCode,
} from './email-codes.js'

/**
 * Auth de CLIENTE. Fluxo independente do staff: usa Customer (não User), os
 * segredos JWT_CUSTOMER_*, e o cookie de cliente. A mecânica de refresh vem de
 * shared/refresh-tokens (a mesma do staff, parametrizada) — só o que difere por
 * entidade mora aqui.
 *
 * O e-mail do cliente é VERIFICADO antes de a conta funcionar, por um código de
 * 6 dígitos digitado na própria tela (checkout, "entrar com código", cadastro)
 * ou pelo link do cadastro. Os dois já devolvem sessão: confirmar é entrar.
 *
 * Invariante: SENHA SÓ EXISTE EM CONTA CONFIRMADA. O cadastro não grava senha,
 * e confirmar uma conta que tinha senha anterior à confirmação a descarta. Sem
 * isso, quem cadastrasse o e-mail alheio com uma senha sua teria a conta quando
 * o dono confirmasse a caixa (pré-sequestro).
 */

export type CustomerSession = {
  customer: AuthCustomer
  accessToken: string
  expiresIn: number
  refreshToken: string
}

/** Campos mínimos de todo `select` de customer. Esquecer um deles aqui faz o Zod
 *  do front rejeitar a resposta inteira, sem mensagem útil.
 *
 *  O `_count` de pedidos não é vaidade: é o que decide `documentLocked`. A partir
 *  do primeiro pedido o CPF virou dado fiscal e a tela precisa saber disso sem
 *  um segundo request. */
export const AUTH_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerifiedAt: true,
  acceptsMarketing: true,
  phone: true,
  pendingEmail: true,
  document: true,
  // Só para derivar `hasPassword`: o hash em si nunca sai de `toAuthCustomer`.
  passwordHash: true,
  _count: { select: { orders: true } },
} as const

const issueAccess = (customerId: string): Promise<string> =>
  signAccessToken(
    { sub: customerId, type: 'customer', storeId: getActiveStoreId() },
    env.JWT_CUSTOMER_ACCESS_SECRET,
    env.ACCESS_TOKEN_TTL,
  )

export const toAuthCustomer = (c: {
  id: string
  name: string
  email: string
  emailVerifiedAt: Date | null
  acceptsMarketing: boolean
  phone: string | null
  pendingEmail: string | null
  document: string | null
  passwordHash: string | null
  _count: { orders: number }
}): AuthCustomer => ({
  id: c.id,
  name: c.name,
  email: c.email,
  emailVerified: c.emailVerifiedAt !== null,
  acceptsMarketing: c.acceptsMarketing,
  phone: c.phone,
  pendingEmail: c.pendingEmail,
  document: c.document,
  // Derivado, não guardado: um booleano no banco poderia divergir do fato.
  documentLocked: c._count.orders > 0,
  hasPassword: c.passwordHash !== null,
})

/**
 * Emite access + refresh e monta a resposta de sessão.
 *
 * Exportada porque a troca de senha também emite uma sessão nova — ela revoga
 * tudo e devolve uma para a aba atual sobreviver. Duplicar a montagem é como o
 * `expiresIn` de um dos dois caminhos fica para trás numa mudança de TTL.
 */
export const issueCustomerSession = async (
  customerId: string,
  ctx: SessionContext,
): Promise<CustomerSession> => {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId: getActiveStoreId(), deletedAt: null },
    select: AUTH_SELECT,
  })
  if (!customer) throw appError(ERROR_CODES.ACCOUNT_DISABLED, 'Conta indisponível.', 403)

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

const verificationTtlMs = (): number => env.EMAIL_VERIFICATION_TTL_HOURS * 3600 * 1000
const resetTtlMs = (): number => env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000

const RESEND_COOLDOWN_SECONDS = RESEND_COOLDOWN_MS / 1000
const CODE_TTL_MINUTES = CODE_TTL_MS / 60_000

/** Caminho do `next` já validado pelo schema; só falta virar query string. */
const verifyUrlFor = (storeUrl: string, token: string, next: string | undefined): string =>
  `${storeUrl}/entrar/verificar-email?token=${encodeURIComponent(token)}` +
  (next ? `&next=${encodeURIComponent(next)}` : '')

/**
 * Emite o link (e, no cadastro, também um código) e manda o e-mail de
 * confirmação. NUNCA lança: é chamada de dentro do cadastro, e uma falha de
 * e-mail não pode transformar uma conta criada com sucesso num 500. O cliente
 * sempre tem a saída do "reenviar".
 *
 * Devolve se o CÓDIGO saiu — é o que diz à tela quando liberar o reenvio.
 *
 * Quando existir a fila (roadmap §14), o corpo daqui vira um publish.
 */
const dispatchVerificationEmail = async (
  customer: { id: string; name: string; email: string },
  ctx: SessionContext,
  options: { withCode: boolean; next?: string | undefined },
): Promise<boolean> => {
  let discardCode: (() => Promise<void>) | undefined
  try {
    const [{ token, confirmDelivery }, branding, codeIssue] = await Promise.all([
      issueCustomerToken({
        customerId: customer.id,
        purpose: 'EMAIL_VERIFICATION',
        ttlMs: verificationTtlMs(),
        ctx,
      }),
      getEmailBranding(),
      options.withCode ? issueEmailCode(customer.email, ctx) : Promise.resolve(null),
    ])
    discardCode = codeIssue?.discard

    const content = renderVerifyEmail({
      branding,
      customerName: customer.name,
      ...(codeIssue ? { code: { value: codeIssue.code, expiresInMinutes: CODE_TTL_MINUTES } } : {}),
      // O token vai na query string e é limpo da URL pelo front assim que lido.
      verifyUrl: verifyUrlFor(branding.storeUrl, token, options.next),
      expiresInHours: env.EMAIL_VERIFICATION_TTL_HOURS,
    })

    const sent = await sendEmailSafe({
      ...content,
      to: customer.email,
      tags: { template: 'verify_email' },
    })

    // Só aposenta os links e códigos anteriores se este de fato saiu.
    if (!sent) {
      await codeIssue?.discard()
      return false
    }
    await Promise.all([confirmDelivery(), codeIssue?.confirmDelivery()])
    return codeIssue !== null
  } catch (err) {
    await discardCode?.().catch(() => undefined)
    // Sem o customerId no log não há como socorrer quem ficou sem o e-mail.
    // A URL e o código, esses, nunca entram no log.
    logger.error({ err, customerId: customer.id }, 'não foi possível enviar a confirmação de e-mail')
    return false
  }
}

export type RegisterResult = { email: string; resendInSeconds: number }

/**
 * Cadastro. NÃO devolve sessão: a conta só entra depois que o cliente digita o
 * código (ou clica no link) enviado por e-mail.
 *
 * E NÃO grava senha — ver o topo do arquivo. A loja guarda a senha digitada e a
 * grava logo após a confirmação, já com a sessão.
 */
export const registerCustomer = async (
  input: RegisterInput,
  ctx: SessionContext,
): Promise<RegisterResult> => {
  const storeId = getActiveStoreId()

  const existing = await prisma.customer.findUnique({
    where: { storeId_email: { storeId, email: input.email } },
    select: { id: true, passwordHash: true, emailVerifiedAt: true },
  })

  // Conta CONFIRMADA sem senha (nasceu pelo código do checkout) também recusa:
  // "assumir" a conta aqui era gravar senha e nome sem provar posse de nada.
  // Quem é o dono entra com o código e cria a senha lá dentro.
  if (existing?.passwordHash || existing?.emailVerifiedAt) {
    throw conflict('Já existe uma conta com este e-mail.', ERROR_CODES.EMAIL_ALREADY_EXISTS)
  }

  // Cadastro repetido sobre uma conta ainda NÃO confirmada (o primeiro e-mail não
  // chegou, ou alguém digitou o endereço alheio): o nome vai para `pendingName` e
  // só vale com a confirmação — reescrevê-lo aqui deixaria qualquer um trocar o
  // nome da conta sem provar posse da caixa.
  // `acceptsMarketing` vai nos DOIS braços: é a escolha que a pessoa acabou de
  // fazer na caixa, e vale a partir de agora. Gravado já no cadastro porque a
  // campanha só considera quem tem `emailVerifiedAt` — conta não confirmada com
  // `true` não recebe nada.
  const customer = existing
    ? await prisma.customer.update({
        where: { id: existing.id },
        data: { pendingName: input.name, acceptsMarketing: input.acceptsMarketing },
        select: { id: true, name: true, email: true },
      })
    : await prisma.customer.create({
        data: {
          storeId,
          name: input.name,
          email: input.email,
          acceptsMarketing: input.acceptsMarketing,
        },
        select: { id: true, name: true, email: true },
      })

  await audit({
    action: EVENTS.customer.registered,
    entityType: 'Customer',
    entityId: customer.id,
    context: { ip: ctx.ip, userAgent: ctx.userAgent },
  })

  const codeSent = await dispatchVerificationEmail(customer, ctx, { withCode: true, next: input.next })

  return { email: customer.email, resendInSeconds: codeSent ? RESEND_COOLDOWN_SECONDS : 0 }
}

/**
 * Reenvio do LINK de confirmação (sem código: código a mais é tentativa a mais
 * para quem chuta — o reenvio de código tem rota e limite próprios). Responde
 * igual para e-mail inexistente, já verificado ou sem conta — quem pede o
 * reenvio não pode descobrir quem tem cadastro aqui.
 */
export const resendVerification = async (email: string, ctx: SessionContext): Promise<void> => {
  const customer = await prisma.customer.findUnique({
    where: { storeId_email: { storeId: getActiveStoreId(), email } },
    select: { id: true, name: true, email: true, emailVerifiedAt: true, deletedAt: true },
  })

  if (!customer || customer.emailVerifiedAt || customer.deletedAt) return

  await dispatchVerificationEmail(customer, ctx, { withCode: false })
}

/**
 * Consome o link, confirma o e-mail e ENTRA: clicar no link prova a posse da
 * caixa, e mandar o cliente ao login logo depois era o salto que perdia a compra.
 * Idempotente só até o consumo: reabrir o mesmo link depois responde link
 * inválido, e é isso que prova o single-use.
 */
export const verifyCustomerEmail = async (
  token: string,
  ctx: SessionContext,
): Promise<CustomerSession> => {
  const stored = await findValidCustomerToken(token, 'EMAIL_VERIFICATION')
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await consumeCustomerToken(tx, stored.id)

    const current = await tx.customer.findUniqueOrThrow({
      where: { id: stored.customerId },
      select: { pendingName: true, emailVerifiedAt: true },
    })

    await tx.customer.update({
      where: { id: stored.customerId },
      data: {
        emailVerifiedAt: current.emailVerifiedAt ?? now,
        lastLoginAt: now,
        // Agora sim o nome do cadastro vale: a posse da caixa está provada.
        ...(current.pendingName ? { name: current.pendingName, pendingName: null } : {}),
        // Senha anterior à confirmação não foi provada por quem clicou (conta
        // antiga, do tempo em que o cadastro gravava senha): descarta.
        ...(current.emailVerifiedAt ? {} : { passwordHash: null }),
      },
    })
  })

  await audit({
    action: EVENTS.customer.emailVerified,
    entityType: 'Customer',
    entityId: stored.customerId,
    context: { ip: ctx.ip, userAgent: ctx.userAgent },
  })

  return issueCustomerSession(stored.customerId, ctx)
}

// ── Código por e-mail ────────────────────────────────────────────────────────

export type EmailCodeSentResult = { email: string; resendInSeconds: number }

/**
 * Manda um código para QUALQUER e-mail, cliente ou não — a conta só nasce quando
 * ele confere. Por isso a resposta não diz nada sobre quem tem cadastro: o
 * mesmo envio, a mesma espera e o mesmo erro valem para todos.
 */
export const requestEmailCode = async (
  email: string,
  ctx: SessionContext,
): Promise<EmailCodeSentResult> => {
  const wait = await emailCodeWaitMs(email, new Date())
  if (wait > 0) {
    const seconds = Math.ceil(wait / 1000)
    throw appError(
      ERROR_CODES.EMAIL_CODE_RESEND_TOO_SOON,
      `Aguarde ${seconds} s para pedir outro código.`,
      429,
      [{ field: 'resendInSeconds', message: String(seconds) }],
    )
  }

  const [{ code, confirmDelivery, discard }, branding] = await Promise.all([
    issueEmailCode(email, ctx),
    getEmailBranding(),
  ])

  const sent = await sendEmailSafe({
    ...renderEmailCode({ branding, code, expiresInMinutes: CODE_TTL_MINUTES }),
    to: email,
    tags: { template: 'email_code' },
  })

  if (!sent) {
    await discard()
    throw appError(
      ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      'Não conseguimos enviar o e-mail agora. Tente de novo em instantes.',
      503,
    )
  }
  await confirmDelivery()

  return { email, resendInSeconds: RESEND_COOLDOWN_SECONDS }
}

/**
 * Confere o código e ENTRA — criando a conta se o e-mail ainda não tiver uma.
 *
 * - E-mail novo: nasce confirmada e SEM senha (o cliente cria uma depois, se
 *   quiser). Sem nome, recusa com NAME_REQUIRED ANTES de consumir: a tela pede o
 *   nome e reenvia o mesmo código.
 * - Conta não confirmada: confirma, e descarta senha e `pendingName`, que não
 *   foram provados por quem tem a caixa (o pré-sequestro do topo do arquivo).
 *   O nome digitado agora, por quem provou a posse, passa a valer.
 * - Conta confirmada: só entra. O nome digitado é ignorado — trocar o nome de
 *   uma conta é coisa da área da conta, não de um formulário de compra.
 */
export const verifyEmailCode = async (
  input: VerifyEmailCodeInput,
  ctx: SessionContext,
): Promise<CustomerSession> => {
  const storeId = getActiveStoreId()
  const checked = await checkEmailCode(input.email, input.code)

  const existing = await prisma.customer.findUnique({
    where: { storeId_email: { storeId, email: input.email } },
    select: { id: true, emailVerifiedAt: true, deletedAt: true },
  })

  if (!existing && !input.name) {
    throw appError(ERROR_CODES.NAME_REQUIRED, 'Informe seu nome para criar a conta.', 422)
  }
  if (existing?.deletedAt) {
    throw appError(ERROR_CODES.ACCOUNT_DISABLED, 'Conta indisponível.', 403)
  }

  const now = new Date()
  const outcome = await prisma.$transaction(async (tx) => {
    await consumeEmailCode(tx, checked.id)

    if (!existing) {
      const created = await tx.customer.create({
        data: {
          storeId,
          email: input.email,
          name: input.name!,
          emailVerifiedAt: now,
          lastLoginAt: now,
        },
        select: { id: true },
      })
      return { customerId: created.id, created: true, verifiedNow: true }
    }

    if (!existing.emailVerifiedAt) {
      await tx.customer.update({
        where: { id: existing.id },
        data: {
          emailVerifiedAt: now,
          lastLoginAt: now,
          passwordHash: null,
          pendingName: null,
          ...(input.name ? { name: input.name } : {}),
        },
      })
      // O link do cadastro deixa de valer: a conta está confirmada e o cliente,
      // dentro. Um link de login vivo por 24h na caixa não compra nada.
      await tx.customerToken.updateMany({
        where: { customerId: existing.id, purpose: 'EMAIL_VERIFICATION', usedAt: null },
        data: { usedAt: now },
      })
      return { customerId: existing.id, created: false, verifiedNow: true }
    }

    await tx.customer.update({ where: { id: existing.id }, data: { lastLoginAt: now } })
    return { customerId: existing.id, created: false, verifiedNow: false }
  })

  const context = { ip: ctx.ip, userAgent: ctx.userAgent }
  if (outcome.created) {
    await audit({ action: EVENTS.customer.registered, entityType: 'Customer', entityId: outcome.customerId, context })
  }
  if (outcome.verifiedNow) {
    await audit({ action: EVENTS.customer.emailVerified, entityType: 'Customer', entityId: outcome.customerId, context })
  }

  return issueCustomerSession(outcome.customerId, ctx)
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

  // O update entra no mesmo Promise.all do staff (auth/service.ts) — mesmo
  // padrão, para não haver dois jeitos de gravar a mesma coisa no projeto.
  // Só no LOGIN: o refresh roda a cada 15min numa aba aberta e faria "último
  // acesso" virar "última renovação de token".
  const [accessToken, refreshToken] = await Promise.all([
    issueAccess(customer.id),
    issueRefreshToken({ kind: 'customer', id: customer.id }, ctx),
    prisma.customer.update({ where: { id: customer.id }, data: { lastLoginAt: new Date() } }),
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

/**
 * Códigos com mais de um dia: nenhum ainda vale (vencem em minutos), e a linha
 * guarda o e-mail de quem pediu — inclusive de quem nunca virou cliente. Chamado
 * pelo job `purge-email-codes`.
 */
export const purgeStaleEmailCodes = (): Promise<number> =>
  deleteEmailCodesCreatedBefore(new Date(Date.now() - 24 * 3600_000))

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
