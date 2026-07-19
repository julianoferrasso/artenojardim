import {
  ERROR_CODES,
  type RecordMovementInput,
  type InventoryLevel,
  type StockItem,
  type VariantLedger,
  type PaginationMeta,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { Prisma, type MovementType } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { appError, notFound, businessError } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit, type AuditContext } from '../../shared/audit.js'
import { withRunningBalance, countDelta } from './domain/ledger.js'

/**
 * Estoque como livro-razão. Duas regras não-negociáveis:
 *  1. Todo movimento é INSERT append-only + a projeção atualizada na MESMA
 *     transação. Nunca UPDATE direto no onHand sem um movimento correspondente.
 *  2. Reserva NÃO é movimento — mexe só em `reserved`, sem tocar no ledger.
 */

const assertVariant = async (variantId: string): Promise<{ sku: string; productName: string }> => {
  const v = await prisma.productVariant.findFirst({
    where: { id: variantId, storeId: getActiveStoreId() },
    select: { sku: true, product: { select: { name: true } } },
  })
  if (!v) throw notFound('Variante')
  return { sku: v.sku, productName: v.product.name }
}

/**
 * Registra um movimento disparado pelo admin (PURCHASE/RETURN/ADJUSTMENT/COUNT).
 *
 * O INSERT do movimento e o UPDATE da projeção acontecem juntos, numa transação:
 * ou o fato é registrado E o cache atualizado, ou nada. A projeção é upsert
 * porque a variante pode ainda não ter linha em InventoryLevel (nasce no primeiro
 * movimento, começando em 0).
 */
export const recordMovement = async (
  input: RecordMovementInput,
  ctx: AuditContext,
): Promise<InventoryLevel> => {
  const storeId = getActiveStoreId()
  await assertVariant(input.variantId)

  const level = await prisma.$transaction(async (tx) => {
    // Saldo atual (0 se ainda não há linha) — necessário para o COUNT calcular a
    // diferença, e para recusar um movimento que deixaria o onHand negativo.
    const current = await tx.inventoryLevel.findUnique({
      where: { variantId: input.variantId },
      select: { onHand: true },
    })
    const onHand = current?.onHand ?? 0

    // COUNT grava a DIFERENÇA para a contagem física; os demais usam quantity.
    const quantity =
      input.type === 'COUNT' ? countDelta(onHand, input.counted!) : input.quantity!

    if (quantity === 0 && input.type === 'COUNT') {
      // Contagem bateu com o sistema: nada a registrar.
      const lvl = await readLevel(tx, input.variantId)
      return lvl
    }

    // Recusa o que deixaria o físico negativo. A CHECK constraint é a última
    // linha; aqui damos a mensagem de negócio antes de bater nela.
    if (onHand + quantity < 0) {
      throw businessError(
        ERROR_CODES.INSUFFICIENT_STOCK,
        `Movimento deixaria o estoque negativo (atual: ${onHand}, movimento: ${quantity})`,
        422,
      )
    }

    await tx.inventoryMovement.create({
      data: {
        storeId,
        variantId: input.variantId,
        type: input.type as MovementType,
        quantity,
        reason: input.reason ?? null,
        userId: ctx.userId ?? null,
      },
    })

    // Garante a linha (onHand: 0) e SÓ ENTÃO incrementa — em dois passos, não um
    // upsert. O Prisma compila upsert para INSERT ... ON CONFLICT DO UPDATE, e o
    // Postgres avalia a CHECK (onHand >= 0) na linha CANDIDATA do INSERT
    // (onHand = quantity) ANTES de resolver o conflito. Com quantity negativo, a
    // candidata -3 viola a constraint e aborta tudo, mesmo que a linha exista e
    // fosse só decrementar. Criar com 0 (sempre válido) e depois fazer um UPDATE
    // puro evita a armadilha; o guard acima já garante que a linha final é >= 0.
    await tx.inventoryLevel.upsert({
      where: { variantId: input.variantId },
      create: { variantId: input.variantId, onHand: 0, reserved: 0 },
      update: {},
    })
    await tx.inventoryLevel.update({
      where: { variantId: input.variantId },
      data: { onHand: { increment: quantity } },
    })

    return readLevel(tx, input.variantId)
  })

  await audit({
    action: input.type === 'COUNT' ? EVENTS.inventory.counted : EVENTS.inventory.adjusted,
    entityType: 'ProductVariant',
    entityId: input.variantId,
    changes: { type: { from: null, to: input.type }, onHand: { from: null, to: level.onHand } },
    context: ctx,
  })

  return level
}

const readLevel = async (
  tx: Prisma.TransactionClient,
  variantId: string,
): Promise<InventoryLevel> => {
  const l = await tx.inventoryLevel.findUnique({
    where: { variantId },
    select: { onHand: true, reserved: true },
  })
  const onHand = l?.onHand ?? 0
  const reserved = l?.reserved ?? 0
  return { variantId, onHand, reserved, available: onHand - reserved }
}

// ── Reserva (usada pelo checkout na Fase 1.11) ────────────────────────────────

/**
 * Reserva atômica: decide E escreve no MESMO comando, deixando o Postgres
 * arbitrar sob o lock de linha. Sem SELECT-antes-de-UPDATE — entre a leitura e
 * a escrita caberia a requisição do outro cliente, e dois compradores levariam
 * a mesma última peça.
 *
 * Zero linhas afetadas = não havia `available` suficiente. Retorna false; quem
 * chama traduz em INSUFFICIENT_STOCK.
 */
export const reserveStock = async (
  variantId: string,
  orderId: string,
  quantity: number,
  expiresAt: Date,
): Promise<boolean> => {
  return prisma.$transaction(async (tx) => {
    const affected = await tx.$executeRaw`
      UPDATE "InventoryLevel"
         SET reserved = reserved + ${quantity}
       WHERE "variantId" = ${variantId}
         AND ("onHand" - reserved) >= ${quantity}
    `
    if (affected === 0) return false

    await tx.inventoryReservation.create({
      data: { variantId, orderId, quantity, expiresAt },
    })
    return true
  })
}

/** Libera uma reserva (falha/expiração). Só mexe em `reserved` — sem movimento,
 *  porque nada aconteceu fisicamente. Idempotente: já liberada, não faz nada. */
export const releaseReservation = async (reservationId: string): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const r = await tx.inventoryReservation.findUnique({
      where: { id: reservationId },
      select: { variantId: true, quantity: true, releasedAt: true },
    })
    if (!r || r.releasedAt) return

    await tx.inventoryLevel.update({
      where: { variantId: r.variantId },
      data: { reserved: { decrement: r.quantity } },
    })
    await tx.inventoryReservation.update({
      where: { id: reservationId },
      data: { releasedAt: new Date() },
    })
  })
}

// ── Leitura ───────────────────────────────────────────────────────────────────

export const getLevel = async (variantId: string): Promise<InventoryLevel> => {
  await assertVariant(variantId)
  return readLevel(prisma, variantId)
}

/** Extrato de uma variante: nível atual + ledger com saldo acumulado. */
export const getVariantLedger = async (variantId: string): Promise<VariantLedger> => {
  const { sku, productName } = await assertVariant(variantId)

  const movements = await prisma.inventoryMovement.findMany({
    where: { variantId, storeId: getActiveStoreId() },
    orderBy: { createdAt: 'asc' }, // cronológico para acumular
    select: {
      id: true,
      type: true,
      quantity: true,
      reason: true,
      reference: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  })

  const withBalance = withRunningBalance(movements)

  return {
    variantId,
    sku,
    productName,
    level: await readLevel(prisma, variantId),
    movements: withBalance.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      reason: m.reason,
      reference: m.reference,
      runningBalance: m.runningBalance,
      userName: m.user?.name ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}

/** Lista de estoque no admin: uma linha por variante, com available. */
export const listStock = async (params: {
  page: number
  perPage: number
  lowStock?: boolean
}): Promise<{ items: StockItem[]; meta: PaginationMeta }> => {
  const storeId = getActiveStoreId()

  const variants = await prisma.productVariant.findMany({
    where: { storeId, product: { deletedAt: null } },
    select: {
      id: true,
      sku: true,
      productId: true,
      product: { select: { name: true } },
      optionValues: { select: { optionValue: { select: { value: true } } } },
      level: { select: { onHand: true, reserved: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const all: StockItem[] = variants.map((v) => {
    const onHand = v.level?.onHand ?? 0
    const reserved = v.level?.reserved ?? 0
    return {
      variantId: v.id,
      sku: v.sku,
      productId: v.productId,
      productName: v.product.name,
      variantLabel: v.optionValues.map((o) => o.optionValue.value).join(' / ') || '—',
      onHand,
      reserved,
      available: onHand - reserved,
    }
  })

  const filtered = params.lowStock ? all.filter((i) => i.available <= 0) : all
  const total = filtered.length
  const start = (params.page - 1) * params.perPage
  const items = filtered.slice(start, start + params.perPage)

  return {
    items,
    meta: { page: params.page, perPage: params.perPage, total, totalPages: Math.ceil(total / params.perPage) },
  }
}

/**
 * Reconciliação: compara a projeção (InventoryLevel.onHand) com o ledger
 * (SUM(quantity)). Divergência = bug — e você quer saber no mesmo dia, com o
 * histórico intacto para corrigir. Roda por um job diário (Fase 2) e é
 * chamável sob demanda no admin.
 */
export const reconcile = async (): Promise<
  Array<{ variantId: string; sku: string; projected: number; ledger: number }>
> => {
  const storeId = getActiveStoreId()

  const ledgerSums = await prisma.inventoryMovement.groupBy({
    by: ['variantId'],
    where: { storeId },
    _sum: { quantity: true },
  })
  const ledgerByVariant = new Map(ledgerSums.map((r) => [r.variantId, r._sum.quantity ?? 0]))

  const levels = await prisma.inventoryLevel.findMany({
    where: { variant: { storeId } },
    select: { variantId: true, onHand: true, variant: { select: { sku: true } } },
  })

  const divergences: Array<{ variantId: string; sku: string; projected: number; ledger: number }> = []
  for (const l of levels) {
    const ledger = ledgerByVariant.get(l.variantId) ?? 0
    if (l.onHand !== ledger) {
      divergences.push({ variantId: l.variantId, sku: l.variant.sku, projected: l.onHand, ledger })
    }
  }
  // Movimentos sem linha de projeção (não deveria acontecer, mas a auditoria pega).
  for (const [variantId, ledger] of ledgerByVariant) {
    if (!levels.some((l) => l.variantId === variantId) && ledger !== 0) {
      const v = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { sku: true } })
      divergences.push({ variantId, sku: v?.sku ?? '?', projected: 0, ledger })
    }
  }

  return divergences
}
