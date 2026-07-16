import { ERROR_CODES, type AuthUser, type LoginInput } from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { prisma } from '../../config/prisma.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { appError, unauthorized } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit } from '../../shared/audit.js'
import {
  verifyPassword,
  dummyVerify,
  generateOpaqueToken,
  hashToken,
} from '../../utils/crypto.js'
import { signAccessToken, ttlToSeconds } from './domain/tokens.js'

export type SessionContext = {
  ip?: string | undefined
  userAgent?: string | undefined
}

export type LoginResult = {
  user: AuthUser
  accessToken: string
  expiresIn: number
  refreshToken: string
}

const refreshExpiry = (): Date =>
  new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400 * 1000)

const issueAccess = (user: { id: string; role: AuthUser['role'] }): Promise<string> =>
  signAccessToken(
    { sub: user.id, type: 'user', role: user.role, storeId: getActiveStoreId() },
    env.JWT_ACCESS_SECRET,
    env.ACCESS_TOKEN_TTL,
  )

const issueRefresh = async (userId: string, ctx: SessionContext): Promise<string> => {
  const token = generateOpaqueToken()
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: refreshExpiry(),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  })
  return token
}

export const loginStaff = async (
  input: LoginInput,
  ctx: SessionContext,
): Promise<LoginResult> => {
  const storeId = getActiveStoreId()

  const user = await prisma.user.findUnique({
    where: { storeId_email: { storeId, email: input.email } },
    select: { id: true, name: true, email: true, role: true, passwordHash: true, isActive: true },
  })

  // Usuário inexistente gasta o MESMO tempo de um argon2 real. Sem isto,
  // "não existe" volta em ~1ms e "senha errada" em ~100ms — diferença medível
  // pela rede que entrega ao atacante a lista de quem tem conta.
  if (!user) {
    await dummyVerify()
    await audit({
      action: EVENTS.auth.loginFailed,
      entityType: 'User',
      entityId: 'unknown',
      context: { ip: ctx.ip, userAgent: ctx.userAgent },
    })
    throw appError(ERROR_CODES.INVALID_CREDENTIALS, 'E-mail ou senha inválidos', 401)
  }

  const valid = await verifyPassword(user.passwordHash, input.password)

  if (!valid) {
    await audit({
      action: EVENTS.auth.loginFailed,
      entityType: 'User',
      entityId: user.id,
      context: { userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
    })
    // Mensagem idêntica à de e-mail inexistente: "senha incorreta" confirmaria
    // ao atacante que o e-mail existe.
    throw appError(ERROR_CODES.INVALID_CREDENTIALS, 'E-mail ou senha inválidos', 401)
  }

  // Checado DEPOIS da senha: responder "conta desativada" antes de validar a
  // senha diria a qualquer um que aquele e-mail existe.
  if (!user.isActive) {
    throw appError(ERROR_CODES.ACCOUNT_DISABLED, 'Conta desativada. Fale com o administrador.', 403)
  }

  const [accessToken, refreshToken] = await Promise.all([
    issueAccess(user),
    issueRefresh(user.id, ctx),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  ])

  await audit({
    action: EVENTS.auth.loginSucceeded,
    entityType: 'User',
    entityId: user.id,
    context: { userId: user.id, ip: ctx.ip, userAgent: ctx.userAgent },
  })

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    expiresIn: ttlToSeconds(env.ACCESS_TOKEN_TTL),
    refreshToken,
  }
}

/**
 * Rotação com detecção de reúso — a parte que a maioria das implementações pula.
 *
 * Cada refresh queima o token e emite outro. Se um token JÁ REVOGADO reaparecer,
 * só há duas explicações: ou o token foi roubado e o ladrão está usando, ou foi
 * roubado e a vítima acabou de usar. Nos dois casos alguém tem uma cópia — e a
 * resposta correta é derrubar a cadeia inteira e forçar login.
 *
 * Sem isto, um refresh roubado dá acesso perpétuo e silencioso: o atacante
 * renova para sempre e nada no sistema jamais indica o problema. Com isto, o
 * roubo se autodenuncia na próxima renovação legítima.
 */
export const refreshStaffSession = async (
  rawToken: string,
  ctx: SessionContext,
): Promise<LoginResult> => {
  const tokenHash = hashToken(rawToken)

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
      replacedById: true,
      user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
    },
  })

  if (!stored || !stored.userId || !stored.user) {
    throw appError(ERROR_CODES.TOKEN_INVALID, 'Sessão inválida', 401)
  }

  // Revogado E com sucessor = foi TROCADO por outro e mesmo assim reapareceu.
  // Só isso é reúso.
  //
  // `replacedById` é o que separa os dois casos, e a distinção importa: logout
  // e revogação administrativa também marcam revokedAt, mas SEM sucessor.
  // Tratar todo revokedAt como roubo faria o botão "voltar" do navegador,
  // depois de um logout, derrubar as sessões do usuário em todos os outros
  // aparelhos — e encher o AuditLog de incidentes falsos, que é exatamente o
  // que esconde um incidente real.
  if (stored.revokedAt && stored.replacedById) {
    await revokeAllUserSessions(stored.userId)

    logger.warn(
      { userId: stored.userId, ip: ctx.ip, tokenId: stored.id },
      'refresh token revogado foi reusado — cadeia derrubada',
    )
    await audit({
      action: EVENTS.auth.refreshReused,
      entityType: 'User',
      entityId: stored.userId,
      context: { userId: stored.userId, ip: ctx.ip, userAgent: ctx.userAgent },
    })

    throw appError(
      ERROR_CODES.REFRESH_REUSED,
      'Sessão encerrada por segurança. Entre novamente.',
      401,
    )
  }

  // Revogado sem sucessor: logout ou revogação administrativa. A sessão acabou,
  // e ponto — nada de alarme, nada de derrubar os outros aparelhos.
  if (stored.revokedAt) {
    throw appError(ERROR_CODES.TOKEN_INVALID, 'Sessão encerrada. Entre novamente.', 401)
  }

  if (stored.expiresAt < new Date()) {
    throw appError(ERROR_CODES.TOKEN_EXPIRED, 'Sessão expirada. Entre novamente.', 401)
  }

  if (!stored.user.isActive) {
    throw appError(ERROR_CODES.ACCOUNT_DISABLED, 'Conta desativada.', 403)
  }

  const newToken = generateOpaqueToken()

  // Transação: revogar o antigo e criar o novo têm que acontecer juntos. Se só
  // a revogação passasse, o usuário perderia a sessão sem ganhar a nova.
  await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        tokenHash: hashToken(newToken),
        userId: stored.userId,
        expiresAt: refreshExpiry(),
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
      select: { id: true },
    })

    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: created.id },
    })
  })

  return {
    user: stored.user,
    accessToken: await issueAccess(stored.user),
    expiresIn: ttlToSeconds(env.ACCESS_TOKEN_TTL),
    refreshToken: newToken,
  }
}

/**
 * Derruba TODAS as sessões ativas do usuário — não só a cadeia daquele token.
 *
 * Perseguir a cadeia por `replacedById` seria mais cirúrgico e está errado: quem
 * roubou um token pode ter roubado outros, e num incidente de credencial o custo
 * de um login a mais é irrelevante perto do de deixar uma sessão comprometida viva.
 */
export const revokeAllUserSessions = async (userId: string): Promise<number> => {
  const { count } = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return count
}

export const logoutStaff = async (rawToken: string | undefined): Promise<void> => {
  if (!rawToken) return

  // updateMany e não update: um token inexistente não pode virar 404. Logout é
  // idempotente — quem pede para sair, sai.
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export const getStaffProfile = async (userId: string): Promise<AuthUser> => {
  const user = await prisma.user.findFirst({
    // storeId no where mesmo tendo o id: é o hábito que compra o multi-tenant
    // da Fase 4. Uma query sem ele hoje é uma query que vaza dado amanhã.
    where: { id: userId, storeId: getActiveStoreId() },
    select: { id: true, name: true, email: true, role: true },
  })

  if (!user) throw unauthorized('Sessão inválida')
  return user
}
