import type { StockPolicy } from '@ecommerce/shared/constants'
import type { StockStatus } from '@ecommerce/shared/contracts'

/**
 * Disponibilidade em funções puras: quanto a loja deixa vender e como a vitrine
 * mostra isso. `available = onHand − reserved` — pedido não pago também reserva.
 *
 * A política do produto decide o que acontece quando o disponível não basta:
 * STOCK_ONLY esgota, MADE_TO_ORDER nem olha o estoque, e o híbrido vende o que
 * há e produz o resto.
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

export const stockStatusOf = (available: number, policy: StockPolicy = 'STOCK_ONLY'): StockStatus => {
  if (policy === 'MADE_TO_ORDER') return 'MADE_TO_ORDER'
  if (available <= 0) return policy === 'STOCK_THEN_MADE_TO_ORDER' ? 'MADE_TO_ORDER' : 'OUT_OF_STOCK'
  if (available <= LOW_STOCK_DISPLAY_THRESHOLD) return 'LOW_STOCK'
  return 'IN_STOCK'
}

export const lowStockRemainingOf = (available: number, policy: StockPolicy = 'STOCK_ONLY'): number | null =>
  stockStatusOf(available, policy) === 'LOW_STOCK' ? available : null

/** Disponível do produto: a soma das variações à venda. */
export const aggregateAvailable = (levels: Array<Level | null | undefined>): number =>
  levels.reduce((sum, level) => sum + availableOf(level), 0)

/**
 * A situação do produto inteiro. Sem nenhuma variação à venda é esgotado em
 * qualquer política: sob encomenda sem variação ativa não tem o que encomendar.
 */
export const productStockStatusOf = (
  activeLevels: Array<Level | null | undefined>,
  policy: StockPolicy,
): StockStatus => (activeLevels.length === 0 ? 'OUT_OF_STOCK' : stockStatusOf(aggregateAvailable(activeLevels), policy))

export type LineSplit = { ready: number; madeToOrder: number }

/**
 * Quanto de uma linha (variante × quantidade) sai da prateleira e quanto é
 * produzido. null = não dá para vender assim (pronta entrega sem saldo).
 *
 * O híbrido DIVIDE: pedir 3 com 2 disponíveis reserva as 2 e produz 1. Mandar a
 * linha inteira para a produção deixaria as 2 peças "à venda" no sistema — e o
 * próximo cliente compraria uma pronta entrega que já foi embalada para outro.
 */
export const splitLine = (p: { policy: StockPolicy; available: number; quantity: number }): LineSplit | null => {
  const available = Math.max(0, p.available)
  switch (p.policy) {
    case 'MADE_TO_ORDER':
      return { ready: 0, madeToOrder: p.quantity }
    case 'STOCK_THEN_MADE_TO_ORDER': {
      const ready = Math.min(p.quantity, available)
      return { ready, madeToOrder: p.quantity - ready }
    }
    case 'STOCK_ONLY':
      return available >= p.quantity ? { ready: p.quantity, madeToOrder: 0 } : null
  }
}

/**
 * O prazo de produção de um pedido: o maior entre as linhas com parte sob
 * encomenda. O pedido sai inteiro, numa remessa só — espera a peça mais lenta.
 */
export const productionDaysOf = (lines: Array<{ madeToOrder: number; productionDays: number | null }>): number =>
  lines.reduce((max, line) => (line.madeToOrder > 0 ? Math.max(max, line.productionDays ?? 0) : max), 0)

/**
 * A vitrine muda? Até o limite cada unidade aparece ("Últimas 2" → "Última
 * unidade" → "Esgotado"); acima dele, 10 → 9 é invisível e não vale derrubar o
 * cache da loja inteira.
 */
const visibleStock = (available: number): number =>
  Math.min(Math.max(available, 0), LOW_STOCK_DISPLAY_THRESHOLD + 1)

export const visibleStockChanged = (before: number, after: number): boolean =>
  visibleStock(before) !== visibleStock(after)
