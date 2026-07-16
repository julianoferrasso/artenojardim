import type { PaginationMeta, PaginationQuery } from '@ecommerce/shared/contracts'

/** Traduz page/perPage já validados pelo Zod para o que o Prisma espera. */
export const toPrismaPagination = (query: PaginationQuery): { skip: number; take: number } => ({
  skip: (query.page - 1) * query.perPage,
  take: query.perPage,
})

export const buildMeta = (query: PaginationQuery, total: number): PaginationMeta => ({
  page: query.page,
  perPage: query.perPage,
  total,
  totalPages: Math.ceil(total / query.perPage),
})
