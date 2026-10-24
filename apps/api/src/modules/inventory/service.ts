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
import { withRunningBalance, countDelta, movementBlocker } from './domain/ledger.js'
import { revalidateStorefront } from '../../integrations/storefront/revalidate.js'
import { notifyBackInStock, notifyStockChanges, type StockChange } from '../notifications/service.js'
import { visibleStockChanged } from './domain/availability.js'

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

  const { level, quantity } = await prisma.$transaction(async (tx) => {
    // Saldo atual (0 se ainda não há linha) — necessário para o COUNT calcular a
    // diferença, e para recusar um movimento que deixaria o onHand negativo ou
    // abaixo do que pedidos em aberto já reservaram.
    const current = await tx.inventoryLevel.findUnique({
      where: { variantId: input.variantId },
      select: { onHand: true, reserved: true },
    })
    const onHand = current?.onHand ?? 0
    const reserved = current?.reserved ?? 0

    // COUNT grava a DIFERENÇA para a contagem física; os demais usam quantity.
    const quantity =
      input.type === 'COUNT' ? countDelta(onHand, input.counted!) : input.quantity!

    if (quantity === 0 && input.type === 'COUNT') {
      // Contagem bateu com o sistema: nada a registrar.
      return { level: await readLevel(tx, input.variantId), quantity }
    }

    // A CHECK constraint é a última linha; aqui damos a mensagem de negócio
    // antes de bater nela (ou no pagamento que bateria nela depois).
    const blocker = movementBlocker({ onHand, reserved, quantity })
    if (blocker === 'NEGATIVE') {
      throw businessError(
        ERROR_CODES.INSUFFICIENT_STOCK,
        `Movimento deixaria o estoque negativo (atual: ${onHand}, movimento: ${quantity})`,
        422,
      )
    }
    if (blocker === 'BELOW_RESERVED') {
      throw businessError(
        ERROR_CODES.INSUFFICIENT_STOCK,
        `Há ${reserved} ${reserved === 1 ? 'unidade reservada' : 'unidades reservadas'} por pedidos aguardando pagamento, e o estoque não pode ficar abaixo disso (atual: ${onHand}, movimento: ${quantity}). Cancele o pedido ou espere o prazo de pagamento vencer.`,
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

    return { level: await readLevel(tx, input.variantId), quantity }
  })

  await audit({
    action: input.type === 'COUNT' ? EVENTS.inventory.counted : EVENTS.inventory.adjusted,
    entityType: 'ProductVariant',
    entityId: input.variantId,
    changes: { type: { from: null, to: input.type }, onHand: { from: null, to: level.onHand } },
    context: ctx,
  })

  // Entrada ou baixa: a vitrine pode mudar ("Esgotado" ↔ à venda), e a baixa
  // (contagem que achou menos, quebra, ajuste) pode cruzar o limite do alerta.
  if (quantity !== 0) {
    await afterStockChange([
      { variantId: input.variantId, before: level.available - quantity, onHand: level.onHand, reserved: level.reserved },
    ])
  }

  return level
}

/**
 * Depois do commit de qualquer mudança no disponível — reserva do checkout,
 * movimento do admin, cancelamento: o alerta de estoque baixo da equipe e a
 * vitrine. Sem isto o produto que esgotou seguia "à venda" até o cache de 60s
 * vencer, e a primeira visita depois dele ainda recebia a página velha.
 *
 * A vitrine só é revalidada quando o que ela MOSTRA muda (ver
 * `visibleStockChanged`): a revalidação derruba o cache da loja inteira. Nunca
 * lança — o fato já está gravado.
 */
export const afterStockChange = async (changes: StockChange[]): Promise<void> => {
  const after = (c: StockChange): number => c.onHand - c.reserved
  const drops = changes.filter((c) => after(c) < c.before)
  if (drops.length > 0) await notifyStockChanges(drops)
  if (changes.some((c) => visibleStockChanged(c.before, after(c)))) void revalidateStorefront()

  // Saiu do zero: quem pediu "Avise-me quando chegar" recebe o aviso.
  const restocked = changes.filter((c) => c.before <= 0 && after(c) > 0).map((c) => c.variantId)
  if (restocked.length > 0) await notifyBackInStock(restocked)
}

/**
 * Estoque de uma variante recém-criada, dentro da transação de quem a criou
 * (produto/variante nascem com o estoque, ou não nascem). A variante é nova,
 * então a projeção nasce aqui direto com o saldo — sem o upsert de dois passos
 * do recordMovement, que existe para linhas que talvez já existam.
 */
export const recordInitialStock = async (
  tx: Prisma.TransactionClient,
  storeId: string,
  variantId: string,
  quantity: number,
  userId?: string,
): Promise<void> => {
  if (quantity <= 0) return

  await tx.inventoryMovement.create({
    data: {
      storeId,
      variantId,
      type: 'PURCHASE',
      quantity,
      reason: 'Estoque inicial',
      userId: userId ?? null,
    },
  })
  await tx.inventoryLevel.create({ data: { variantId, onHand: quantity, reserved: 0 } })
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

/**
 * Liquida as reservas de um pedido PAGO: a intenção vira fato. Para cada reserva
 * ainda não liberada, lança um movimento SALE (negativo, sai da prateleira) E
 * decrementa `onHand` junto com `reserved` — a peça deixa o físico e a reserva ao
 * mesmo tempo. Roda DENTRO da transação do webhook (recebe o `tx`).
 *
 * Idempotente pelo filtro `releasedAt: null`: reexecutar (Stripe reentrega o
 * evento) não encontra reserva a liquidar e não duplica movimento. `onHand -= qty`
 * nunca fica negativo — a reserva só existe porque havia `available >= qty`.
 */
export const settleOrderReservations = async (
  tx: Prisma.TransactionClient,
  storeId: string,
  orderId: string,
): Promise<void> => {
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderId, releasedAt: null },
    select: { id: true, variantId: true, quantity: true },
  })

  for (const r of reservations) {
    await tx.inventoryMovement.create({
      data: {
        storeId,
        variantId: r.variantId,
        type: 'SALE',
        quantity: -r.quantity,
        reference: `order:${orderId}`,
      },
    })
    await tx.inventoryLevel.update({
      where: { variantId: r.variantId },
      data: { onHand: { decrement: r.quantity }, reserved: { decrement: r.quantity } },
    })
    await tx.inventoryReservation.update({
      where: { id: r.id },
      data: { releasedAt: new Date() },
    })
  }
}

/**
 * Uma reserva precisa sobreviver à cobrança que ela garante: o Pix gerado aos 50
 * minutos de uma reserva de 60 venceria depois dela, e um pagamento chegando no
 * fim estaria pagando estoque que a expiração já liberou. Só ESTENDE — uma
 * reserva com prazo maior fica como está.
 */
export const extendOrderReservations = async (
  orderId: string,
  until: Date,
): Promise<void> => {
  await prisma.inventoryReservation.updateMany({
    where: { orderId, releasedAt: null, expiresAt: { lt: until } },
    data: { expiresAt: until },
  })
}

/**
 * Cancelamento de pedido NÃO pago: as reservas morrem sem virar fato. Só
 * `reserved` diminui — nenhum movimento, porque nada saiu da prateleira.
 *
 * Espelho de `settleOrderReservations` para o caminho triste, e idempotente pelo
 * mesmo filtro `releasedAt: null`. Recebe `tx` para rodar na transação do
 * cancelamento: liberar a reserva e marcar o pedido cancelado é um átomo.
 */
export const releaseOrderReservations = async (
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<StockChange[]> => {
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderId, releasedAt: null },
    select: { id: true, variantId: true, quantity: true },
  })

  const changes: StockChange[] = []
  for (const r of reservations) {
    const level = await tx.inventoryLevel.update({
      where: { variantId: r.variantId },
      data: { reserved: { decrement: r.quantity } },
      select: { onHand: true, reserved: true },
    })
    await tx.inventoryReservation.update({
      where: { id: r.id },
      data: { releasedAt: new Date() },
    })
    changes.push({ variantId: r.variantId, before: level.onHand - level.reserved - r.quantity, ...level })
  }
  return changes
}

/**
 * Cancelamento de pedido JÁ PAGO: as reservas viraram SALE e o `onHand` já caiu.
 * A peça volta à prateleira com um CANCELLATION (+qty) — o contrário exato do
 * SALE. Nunca um UPDATE solto no onHand: o ledger é append-only, e uma correção
 * invisível é uma divergência que a reconciliação vai acusar meses depois.
 *
 * Idempotente por verificação prévia: reexecutar não pode devolver a mesma peça
 * duas vezes.
 */
export const restockCanceledOrder = async (
  tx: Prisma.TransactionClient,
  storeId: string,
  orderId: string,
  userId?: string,
): Promise<StockChange[]> => {
  const reference = `order:${orderId}`

  const already = await tx.inventoryMovement.findFirst({
    where: { storeId, reference, type: 'CANCELLATION' },
    select: { id: true },
  })
  if (already) return []

  // Base = o que realmente saiu por este pedido (os SALE), não os itens do
  // pedido: se um item nunca chegou a ser liquidado, devolvê-lo criaria estoque
  // do nada.
  const sales = await tx.inventoryMovement.findMany({
    where: { storeId, reference, type: 'SALE' },
    select: { variantId: true, quantity: true },
  })

  const changes: StockChange[] = []
  for (const s of sales) {
    const quantity = Math.abs(s.quantity)
    if (quantity === 0) continue

    await tx.inventoryMovement.create({
      data: {
        storeId,
        variantId: s.variantId,
        type: 'CANCELLATION',
        quantity,
        reference,
        reason: 'Pedido cancelado',
        userId: userId ?? null,
      },
    })
    const level = await tx.inventoryLevel.update({
      where: { variantId: s.variantId },
      data: { onHand: { increment: quantity } },
      select: { onHand: true, reserved: true },
    })
    changes.push({ variantId: s.variantId, before: level.onHand - level.reserved - quantity, ...level })
  }
  return changes
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
      product: { select: { name: true, stockPolicy: true } },
      optionValues: { select: { optionValue: { select: { value: true } } } },
      level: { select: { onHand: true, reserved: true } },
      _count: { select: { stockNotifications: true } },
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
      waitingCount: v._count.stockNotifications,
      stockPolicy: v.product.stockPolicy,
    }
  })

  // "Estoque baixo" é o que deixou de vender. Sob encomenda e híbrido continuam
  // vendendo com zero — listá-los aqui só enterraria o que pede reposição.
  const filtered = params.lowStock
    ? all.filter((i) => i.available <= 0 && i.stockPolicy === 'STOCK_ONLY')
    : all
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
