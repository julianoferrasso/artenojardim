import type { CustomerTokenPurpose } from '@prisma/client'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { prisma, type PrismaTransaction } from '../../config/prisma.js'
import { appError } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { generateOpaqueToken, hashToken } from '../../utils/crypto.js'
import type { SessionContext } from '../../shared/refresh-tokens.js'

/**
 * Mecânica dos tokens de uso único que viajam por e-mail (confirmação de conta e
 * redefinição de senha).
 *
 * Mesma filosofia do refresh token: o banco guarda o SHA-256, nunca o token cru.
 * SHA e não argon2 porque são 256 bits de entropia real — não há força bruta
 * viável, e o custo do argon2 não compraria nada.
 *
 * Não é `domain/` porque faz I/O; é a camada de dados desta mecânica.
 */

const invalidTokenError = () =>
  appError(
    ERROR_CODES.EMAIL_TOKEN_INVALID,
    'Este link expirou ou já foi utilizado. Solicite um novo.',
    400,
  )

/**
 * Emite um token. Devolve o CRU (a única vez que ele existe fora do e-mail) e um
 * `confirmDelivery()` que aposenta os links anteriores.
 *
 * Por que em dois tempos: invalidar os antigos JUNTO com a emissão parece mais
 * simples, mas se o envio falhar depois disso o cliente fica sem link nenhum —
 * o novo nunca chegou e o antigo acabou de morrer. Emitindo primeiro e só
 * aposentando os antigos após a entrega, uma falha do SES é inofensiva: o link
 * que ele já tinha continua valendo.
 */
export const issueCustomerToken = async (params: {
  customerId: string
  purpose: CustomerTokenPurpose
  ttlMs: number
  ctx: SessionContext
}): Promise<{ token: string; confirmDelivery: () => Promise<void> }> => {
  const token = generateOpaqueToken()

  const created = await prisma.customerToken.create({
    data: {
      customerId: params.customerId,
      purpose: params.purpose,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + params.ttlMs),
      ip: params.ctx.ip ?? null,
      userAgent: params.ctx.userAgent ?? null,
    },
    select: { id: true },
  })

  const confirmDelivery = async (): Promise<void> => {
    // Todos os vivos da mesma finalidade MENOS este: sem o `not`, o token recém
    // enviado se invalidaria sozinho.
    await prisma.customerToken.updateMany({
      where: {
        customerId: params.customerId,
        purpose: params.purpose,
        usedAt: null,
        id: { not: created.id },
      },
      data: { usedAt: new Date() },
    })
  }

  return { token, confirmDelivery }
}

export type ValidCustomerToken = {
  id: string
  customerId: string
}

/**
 * Valida sem consumir. Lança o MESMO erro para inexistente, expirado, já usado e
 * de outra finalidade — distinguir os casos diria ao atacante que aquele token
 * um dia existiu.
 */
export const findValidCustomerToken = async (
  rawToken: string,
  purpose: CustomerTokenPurpose,
): Promise<ValidCustomerToken> => {
  const stored = await prisma.customerToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    select: {
      id: true,
      customerId: true,
      purpose: true,
      usedAt: true,
      expiresAt: true,
      // A tabela não tem storeId próprio (o dono é o Customer), então o filtro
      // de loja é aqui — é o que impede um token de outra loja valer nesta
      // quando o multi-tenant chegar (Fase 4).
      customer: { select: { storeId: true, deletedAt: true } },
    },
  })

  if (
    !stored ||
    stored.purpose !== purpose ||
    stored.usedAt ||
    stored.expiresAt < new Date() ||
    stored.customer.storeId !== getActiveStoreId() ||
    stored.customer.deletedAt
  ) {
    throw invalidTokenError()
  }

  return { id: stored.id, customerId: stored.customerId }
}

/**
 * Consome dentro de uma transação. O `usedAt: null` no WHERE é o que torna o
 * consumo atômico: duas requisições com o mesmo token disputam a mesma linha e
 * só uma afeta um registro — a outra recebe count 0 e o erro de link inválido.
 */
export const consumeCustomerToken = async (
  tx: PrismaTransaction,
  tokenId: string,
): Promise<void> => {
  const { count } = await tx.customerToken.updateMany({
    where: { id: tokenId, usedAt: null },
    data: { usedAt: new Date() },
  })

  if (count === 0) throw invalidTokenError()
}
