/**
 * Quando uma queda de estoque vira alerta. Só no CRUZAMENTO: a venda que leva o
 * disponível de 3 para 2 (limite 2) avisa; a de 2 para 1 não repete. Zerar avisa
 * de novo — esgotado é outra notícia. Cancelamento devolve estoque e "rearma"
 * sozinho, porque a próxima queda volta a cruzar o limite.
 *
 * O disponível é `onHand − reserved`: é o que a loja deixa vender. Pedido não
 * pago também reserva, então esgotado pode ser "esgotado por reserva".
 */
export type LowStockCrossing = 'low' | 'out'

export const lowStockCrossing = (p: { before: number; after: number; threshold: number }): LowStockCrossing | null => {
  if (p.after >= p.before) return null
  if (p.after <= 0) return 'out'
  if (p.after <= p.threshold && p.before > p.threshold) return 'low'
  return null
}
