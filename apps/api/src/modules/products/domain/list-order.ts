/**
 * A vitrine pública lista primeiro o que dá para comprar. Os esgotados vão para
 * o fim, não somem: a página deles segue no Google e mostra o catálogo.
 *
 * O banco não ordena por "tem estoque" (o disponível é soma dos níveis das
 * variações), então a listagem vira dois segmentos paginados como se fossem um:
 * primeiro os com estoque, depois os sem. Esta função diz quanto ler de cada.
 */
export type Segment = { skip: number; take: number }

export const splitPage = (p: {
  page: number
  perPage: number
  /** Quantos produtos COM estoque casam com o filtro. */
  inCount: number
}): { in: Segment; out: Segment } => {
  const offset = (p.page - 1) * p.perPage
  const inTake = Math.max(0, Math.min(p.perPage, p.inCount - offset))
  return {
    in: { skip: Math.min(offset, p.inCount), take: inTake },
    out: { skip: Math.max(0, offset - p.inCount), take: p.perPage - inTake },
  }
}
