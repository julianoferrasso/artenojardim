/**
 * O coração do "nunca confie no front": itens + frete (+ desconto) → totais.
 *
 * Função PURA — sem Prisma, sem fetch, sem Date. Recebe centavos, devolve
 * centavos. Testável em milissegundos. Quem chama (o service) já leu os preços do
 * banco; aqui só se faz a aritmética, com as invariantes que protegem o dinheiro:
 * nada fica negativo, o desconto dos produtos nunca passa do subtotal e o do
 * frete nunca passa do frete.
 */

export type TotalsItem = { unitPrice: number; quantity: number }

export type TotalsInput = {
  items: TotalsItem[]
  shippingCents: number
  /** Desconto de cupom sobre os produtos. */
  discountCents?: number
  /** Desconto de cupom sobre o frete (FREE_SHIPPING). */
  shippingDiscountCents?: number
}

export type Totals = {
  subtotal: number
  discountTotal: number
  shippingTotal: number
  total: number
}

export const calculateTotals = (input: TotalsInput): Totals => {
  const subtotal = input.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)

  // Desconto nunca passa do subtotal (senão o total ficaria negativo e o frete
  // "pagaria" a diferença — fraude ou bug). Clampa entre 0 e o subtotal.
  const productDiscount = Math.min(Math.max(0, input.discountCents ?? 0), subtotal)
  const shippingTotal = Math.max(0, input.shippingCents)
  // O frete continua cheio em shippingTotal (é o que a loja paga à transportadora);
  // o abatimento entra no desconto, para o pedido mostrar "Desconto (CUPOM)".
  const shippingDiscount = Math.min(Math.max(0, input.shippingDiscountCents ?? 0), shippingTotal)
  const discountTotal = productDiscount + shippingDiscount
  const total = subtotal - discountTotal + shippingTotal

  return { subtotal, discountTotal, shippingTotal, total }
}
