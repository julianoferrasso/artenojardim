import type { ReorderSkipReason } from '@ecommerce/shared/contracts'

/**
 * Por que um item do carrinho não pode ser comprado como está — null se pode.
 *
 * A ordem importa: variação aposentada ou produto fora do ar é "indisponível"
 * mesmo com estoque, porque repor a prateleira não traria o item de volta. Entre
 * os de estoque, PARTIAL tem saída (ajustar ao que resta); OUT_OF_STOCK não.
 */
export const cartItemIssue = (p: {
  active: boolean
  available: number
  quantity: number
}): ReorderSkipReason | null => {
  if (!p.active) return 'UNAVAILABLE'
  if (p.available <= 0) return 'OUT_OF_STOCK'
  if (p.available < p.quantity) return 'PARTIAL'
  return null
}
