import type { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'
import { getActiveStoreId } from './store-context.js'

/**
 * Auditoria de ação de staff.
 *
 * Chamada no SERVICE, nunca em middleware: o middleware vê a requisição, mas não
 * sabe O QUE mudou — e o diff é justamente o valor da auditoria.
 *
 * Não auditamos: leitura (volume enorme, valor baixo) e ação de cliente
 * (o pedido já é o registro).
 */

export type AuditContext = {
  userId?: string
  ip?: string
  userAgent?: string
}

export type AuditInput = {
  /** Vocabulário de EVENTS: "product.updated", "category.deleted". */
  action: string
  entityType: string
  entityId: string
  changes?: Record<string, { from: unknown; to: unknown }>
  context?: AuditContext
}

/**
 * Campos que nunca entram no diff, mesmo que mudem. O log tem redação própria,
 * mas o AuditLog é uma tabela — o dado ficaria lá, legível, para sempre.
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordHash',
  'token',
  'tokenHash',
  'accessToken',
  'refreshToken',
  'document',
  'cvc',
])

const redactChanges = (
  changes: Record<string, { from: unknown; to: unknown }>,
): Record<string, { from: unknown; to: unknown }> =>
  Object.fromEntries(
    Object.entries(changes).map(([field, value]) =>
      SENSITIVE_FIELDS.has(field) ? [field, { from: '[redacted]', to: '[redacted]' }] : [field, value],
    ),
  )

/**
 * O diff carrega valores `unknown` (vêm de campos de entidade), e o Prisma recusa
 * `unknown` como JSON — corretamente, porque `unknown` pode ser Date ou BigInt.
 *
 * O round-trip resolve de verdade em vez de fingir com um cast: Date vira ISO
 * string, `undefined` some, e o que sobra É JSON. BigInt lançaria aqui, no
 * caminho de escrita da auditoria, que é onde a gente quer descobrir — e não em
 * produção, com a operação já feita.
 */
const toJson = (changes: Record<string, { from: unknown; to: unknown }>): Prisma.InputJsonObject =>
  JSON.parse(JSON.stringify(redactChanges(changes))) as Prisma.InputJsonObject

/**
 * Nunca lança. Auditoria que derruba a operação auditada é pior que auditoria
 * ausente: perde-se o dado E a ação. Falha vira log de erro e segue.
 */
export const audit = async (input: AuditInput): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        storeId: getActiveStoreId(),
        userId: input.context?.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        ...(input.changes ? { changesJson: toJson(input.changes) } : {}),
        ip: input.context?.ip ?? null,
        userAgent: input.context?.userAgent ?? null,
      },
    })
  } catch (err) {
    logger.error({ err, action: input.action, entityId: input.entityId }, 'falha ao gravar auditoria')
  }
}

/**
 * Diff entre dois estados, só com o que mudou. Evita gravar changesJson gigante
 * quando o usuário salvou o formulário sem tocar em nada.
 */
export const diff = <T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> => {
  const changes: Record<string, { from: unknown; to: unknown }> = {}

  for (const [key, next] of Object.entries(after)) {
    const prev = before[key]
    if (next === undefined) continue
    if (JSON.stringify(prev) === JSON.stringify(next)) continue
    changes[key] = { from: prev, to: next }
  }

  return changes
}
