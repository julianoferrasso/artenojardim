import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { prisma } from '../config/prisma.js'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { appError } from './errors.js'
import { audit } from './audit.js'
import { generateOpaqueToken, hashToken } from '../utils/crypto.js'

/**
 * Mecânica de refresh token — rotação com detecção de reúso — COMPARTILHADA por
 * staff e cliente. Os dois fluxos são independentes por segurança (cookies e
 * segredos distintos), mas a mecânica é idêntica, e duplicá-la seria manter 80
 * linhas em sincronia. Aqui ela é parametrizada pelo "principal".
 *
 * O que difere entre staff/cliente (entidade, segredo, cookie) fica nos services;
 * o que é igual (emitir, rotacionar, detectar reúso, revogar) fica aqui.
 */

/** Quem é o dono da sessão: staff (userId) ou cliente (customerId). */
export type Principal =
  | { kind: 'user'; id: string }
  | { kind: 'customer'; id: string }

export type SessionContext = {
  ip?: string | undefined
  userAgent?: string | undefined
}

const refreshExpiry = (): Date => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400 * 1000)

const principalWhere = (p: Principal) =>
  p.kind === 'user' ? { userId: p.id } : { customerId: p.id }

/** Emite um refresh token novo e persiste o hash. Devolve o token cru (vai no cookie). */
export const issueRefreshToken = async (
  principal: Principal,
  ctx: SessionContext,
): Promise<string> => {
  const token = generateOpaqueToken()
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(token),
      ...principalWhere(principal),
      expiresAt: refreshExpiry(),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  })
  return token
}

/** Revoga TODAS as sessões ativas do principal — não só a cadeia. Num incidente
 *  de credencial, um login a mais é irrelevante perto de deixar sessão viva. */
export const revokeAllSessions = async (principal: Principal): Promise<number> => {
  const { count } = await prisma.refreshToken.updateMany({
    where: { ...principalWhere(principal), revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return count
}

export type ValidatedRefresh = {
  principal: Principal
  /** Emite o próximo token da cadeia dentro da MESMA transação do refresh. */
  rotate: () => Promise<string>
}

/**
 * Valida um refresh token e prepara a rotação. Lança AppError em qualquer caso
 * inválido; detecta reúso (token revogado COM sucessor reaparecendo) e derruba a
 * cadeia inteira. Devolve o principal e um `rotate()` que o service chama para
 * emitir o próximo token.
 *
 * `resolvePrincipal` extrai o principal da linha (userId ou customerId) e valida
 * que a conta ainda está ativa — é a parte específica de cada fluxo.
 */
export const validateAndRotate = async (
  rawToken: string,
  ctx: SessionContext,
  expectedKind: Principal['kind'],
): Promise<ValidatedRefresh> => {
  const tokenHash = hashToken(rawToken)

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      customerId: true,
      expiresAt: true,
      revokedAt: true,
      replacedById: true,
    },
  })

  const principalId = expectedKind === 'user' ? stored?.userId : stored?.customerId
  if (!stored || !principalId) {
    throw appError(ERROR_CODES.TOKEN_INVALID, 'Sessão inválida', 401)
  }
  const principal: Principal = { kind: expectedKind, id: principalId }

  // Revogado E com sucessor = foi trocado por outro e mesmo assim reapareceu.
  // Só isso é reúso. Logout também marca revokedAt, mas SEM sucessor.
  if (stored.revokedAt && stored.replacedById) {
    await revokeAllSessions(principal)
    logger.warn({ ...principalWhere(principal), ip: ctx.ip, tokenId: stored.id },
      'refresh token revogado foi reusado — cadeia derrubada')
    await audit({
      action: EVENTS.auth.refreshReused,
      entityType: expectedKind === 'user' ? 'User' : 'Customer',
      entityId: principal.id,
      context: { userId: expectedKind === 'user' ? principal.id : undefined, ip: ctx.ip, userAgent: ctx.userAgent },
    })
    throw appError(ERROR_CODES.REFRESH_REUSED, 'Sessão encerrada por segurança. Entre novamente.', 401)
  }

  // Revogado sem sucessor: logout ou revogação administrativa. Acabou, sem alarme.
  if (stored.revokedAt) {
    throw appError(ERROR_CODES.TOKEN_INVALID, 'Sessão encerrada. Entre novamente.', 401)
  }

  if (stored.expiresAt < new Date()) {
    throw appError(ERROR_CODES.TOKEN_EXPIRED, 'Sessão expirada. Entre novamente.', 401)
  }

  const rotate = async (): Promise<string> => {
    const newToken = generateOpaqueToken()
    // Transação: revogar o antigo e criar o novo juntos. Só a revogação
    // passando deixaria o usuário sem sessão e sem a nova.
    await prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          tokenHash: hashToken(newToken),
          ...principalWhere(principal),
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
    return newToken
  }

  return { principal, rotate }
}

export const revokeToken = async (rawToken: string | undefined): Promise<void> => {
  if (!rawToken) return
  // updateMany: token inexistente não vira 404. Logout é idempotente.
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
