import { Prisma } from '@prisma/client'
import type {
  AdminCustomerListItem,
  AdminCustomerStats,
} from '@ecommerce/shared/contracts'

/**
 * Projeções e tradução linha → DTO.
 *
 * Existe como repository porque o SELECT de detalhe é grande e o de lista é
 * reusado pela listagem e pelo retorno das três rotas de escrita — sem um lugar
 * único, cada endpoint inventaria o seu e a tela receberia formatos diferentes
 * conforme o botão.
 */

export const LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  emailVerifiedAt: true,
  acceptsMarketing: true,
  lastLoginAt: true,
  deletedAt: true,
  createdAt: true,
} satisfies Prisma.CustomerSelect

export type ListRow = Prisma.CustomerGetPayload<{ select: typeof LIST_SELECT }>

export const DETAIL_SELECT = {
  ...LIST_SELECT,
  document: true,
  documentType: true,
  birthDate: true,
  updatedAt: true,
  passwordHash: true,
} satisfies Prisma.CustomerSelect

export type DetailRow = Prisma.CustomerGetPayload<{ select: typeof DETAIL_SELECT }>

/** Cliente sem pedido pago não aparece no groupBy — e é justamente quem o
 *  lojista procura ao filtrar por marketing. Sem este zero, a linha vem
 *  `undefined` e a tabela quebra. */
export const EMPTY_STATS: AdminCustomerStats = {
  ordersCount: 0,
  totalSpent: 0,
  averageTicket: 0,
  lastOrderAt: null,
}

export const toListItem = (row: ListRow, stats: AdminCustomerStats): AdminCustomerListItem => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  emailVerified: row.emailVerifiedAt !== null,
  acceptsMarketing: row.acceptsMarketing,
  lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  deletedAt: row.deletedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  stats,
})

export const ADDRESS_SELECT = {
  id: true,
  label: true,
  recipient: true,
  zipCode: true,
  street: true,
  number: true,
  complement: true,
  district: true,
  city: true,
  state: true,
  isDefault: true,
} satisfies Prisma.AddressSelect
