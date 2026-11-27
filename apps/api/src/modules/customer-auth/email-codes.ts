import { EMAIL_CODE_LENGTH, ERROR_CODES } from '@ecommerce/shared/contracts'
import { prisma, type PrismaTransaction } from '../../config/prisma.js'
import { env } from '../../config/env.js'
import { appError } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { generateNumericCode, hmacSha256, safeCompare } from '../../utils/crypto.js'
import {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  attemptsLeftMessage,
  resendWaitMs,
} from '../../utils/one-time-code.js'
import type { SessionContext } from '../../shared/refresh-tokens.js'

/**
 * Mecânica do código de 6 dígitos que prova a posse de um e-mail — a camada de
 * dados dele, como `tokens.ts` é a do link. O que o código CAUSA (criar a conta,
 * entrar) mora no service.
 *
 * Indexado por e-mail, não por cliente: pedir um código não cria conta, e a
 * mesma resposta vale para quem é e quem não é cliente.
 */

/**
 * Chave do HMAC: derivada do segredo do access token com rótulo próprio. O
 * mesmo segredo assina JWT; a derivação separa os dois usos sem exigir env nova.
 */
const codeKey = (): string => hmacSha256(env.JWT_CUSTOMER_ACCESS_SECRET, 'customer-email-code:v1')

/** Loja e e-mail entram no texto: o mesmo código em dois e-mails gera hashes diferentes. */
export const emailCodeDigest = (storeId: string, email: string, code: string): string =>
  hmacSha256(codeKey(), `${storeId}:${email}:${code}`)

const expiredError = (message = 'Este código venceu. Peça um novo.') =>
  appError(ERROR_CODES.EMAIL_CODE_EXPIRED, message, 400)

/** Milissegundos até este e-mail poder pedir outro código. 0 = já pode. */
export const emailCodeWaitMs = async (email: string, now: Date): Promise<number> => {
  const last = await prisma.customerEmailCode.findFirst({
    where: { storeId: getActiveStoreId(), email },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return resendWaitMs(last?.createdAt ?? null, now)
}

/**
 * Emite um código. Devolve o CRU (a única vez que ele existe fora do e-mail) e
 * dois desfechos para depois do envio:
 * - `confirmDelivery()` aposenta os códigos MAIS ANTIGOS. Só depois de entregue,
 *   como no link: se o SES falhasse, o cliente ficaria sem código nenhum.
 * - `discard()` apaga este. Sem isso, a espera do reenvio prenderia quem só quer
 *   tentar de novo depois de um envio que nem saiu.
 */
export const issueEmailCode = async (
  email: string,
  ctx: SessionContext,
): Promise<{ code: string; confirmDelivery: () => Promise<void>; discard: () => Promise<void> }> => {
  const storeId = getActiveStoreId()
  const code = generateNumericCode(EMAIL_CODE_LENGTH)

  const created = await prisma.customerEmailCode.create({
    data: {
      storeId,
      email,
      codeHash: emailCodeDigest(storeId, email, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
    select: { id: true, createdAt: true },
  })

  const confirmDelivery = async (): Promise<void> => {
    // `lt` e não `not: id`: dois pedidos quase juntos não aposentam um ao outro —
    // o mais novo sempre sobrevive.
    await prisma.customerEmailCode.updateMany({
      where: { storeId, email, usedAt: null, createdAt: { lt: created.createdAt } },
      data: { usedAt: new Date() },
    })
  }

  const discard = async (): Promise<void> => {
    await prisma.customerEmailCode.deleteMany({ where: { id: created.id, storeId } })
  }

  return { code, confirmDelivery, discard }
}

/**
 * Confere o código contra o MAIS NOVO ainda não usado deste e-mail — o anterior
 * deixa de valer quando outro é enviado. Não consome: o efeito (criar conta,
 * entrar) decide na própria transação, via `consumeEmailCode`.
 *
 * A tentativa é gasta ANTES de comparar: duas requisições em paralelo não ganham
 * uma tentativa extra cada. Errar a última mata o código.
 */
export const checkEmailCode = async (email: string, code: string): Promise<{ id: string }> => {
  const storeId = getActiveStoreId()
  const now = new Date()

  const newest = await prisma.customerEmailCode.findFirst({
    where: { storeId, email, usedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (!newest) throw expiredError()

  const spent = await prisma.customerEmailCode.updateMany({
    where: {
      id: newest.id,
      storeId,
      usedAt: null,
      expiresAt: { gt: now },
      attempts: { lt: MAX_CODE_ATTEMPTS },
    },
    data: { attempts: { increment: 1 } },
  })
  if (spent.count === 0) throw expiredError()

  const current = await prisma.customerEmailCode.findFirstOrThrow({
    where: { id: newest.id, storeId },
    select: { codeHash: true, attempts: true },
  })
  if (safeCompare(current.codeHash, emailCodeDigest(storeId, email, code))) return { id: newest.id }

  const left = MAX_CODE_ATTEMPTS - current.attempts
  if (left > 0) {
    throw appError(ERROR_CODES.EMAIL_CODE_INVALID, `Código incorreto. ${attemptsLeftMessage(left)}`, 400)
  }
  await prisma.customerEmailCode.updateMany({
    where: { id: newest.id, storeId, usedAt: null },
    data: { usedAt: now },
  })
  throw expiredError('Código incorreto, e as tentativas acabaram. Peça um novo código.')
}

/**
 * Consome dentro da transação do efeito. O `usedAt: null` no WHERE torna o
 * consumo atômico: duas requisições com o mesmo código disputam a linha, e a
 * segunda recebe "venceu" em vez de criar uma segunda sessão.
 */
export const consumeEmailCode = async (tx: PrismaTransaction, id: string): Promise<void> => {
  const { count } = await tx.customerEmailCode.updateMany({
    where: { id, storeId: getActiveStoreId(), usedAt: null },
    data: { usedAt: new Date() },
  })
  if (count === 0) throw expiredError()
}

export const deleteEmailCodesCreatedBefore = async (cutoff: Date): Promise<number> => {
  const { count } = await prisma.customerEmailCode.deleteMany({
    where: { storeId: getActiveStoreId(), createdAt: { lt: cutoff } },
  })
  return count
}
