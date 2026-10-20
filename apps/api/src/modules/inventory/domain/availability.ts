import type { StockStatus } from '@ecommerce/shared/contracts'

/**
 * Disponibilidade em funções puras: quanto a loja deixa vender e como a vitrine
 * mostra isso. `available = onHand − reserved` — pedido não pago também reserva.
 */

/** "Últimas 2 unidades" (arquitetura §19): de 1 até aqui a vitrine mostra quantas restam. */
export const LOW_STOCK_DISPLAY_THRESHOLD = 2

type Level = { onHand: number; reserved: number }

/**
 * O que sobra para vender. Nunca negativo: o físico pode ter ficado abaixo do
 * reservado antes da trava do `recordMovement`, e "−1 disponível" não é estado
 * que a vitrine (nem o carrinho) entenda.
 */
export const availableOf = (level: Level | null | undefined): number =>
  level ? Math.max(0, level.onHand - level.reserved) : 0

export const stockStatusOf = (available: number): StockStatus => {
  if (available <= 0) return 'OUT_OF_STOCK'
  if (available <= LOW_STOCK_DISPLAY_THRESHOLD) return 'LOW_STOCK'
  return 'IN_STOCK'
}

export const lowStockRemainingOf = (available: number): number | null =>
  stockStatusOf(available) === 'LOW_STOCK' ? available : null

/** Disponível do produto: a soma das variações à venda. */
export const aggregateAvailable = (levels: Array<Level | null | undefined>): number =>
  levels.reduce((sum, level) => sum + availableOf(level), 0)

/**
 * A vitrine muda? Até o limite cada unidade aparece ("Últimas 2" → "Última
 * unidade" → "Esgotado"); acima dele, 10 → 9 é invisível e não vale derrubar o
 * cache da loja inteira.
 */
const visibleStock = (available: number): number =>
  Math.min(Math.max(available, 0), LOW_STOCK_DISPLAY_THRESHOLD + 1)

export const visibleStockChanged = (before: number, after: number): boolean =>
  visibleStock(before) !== visibleStock(after)
