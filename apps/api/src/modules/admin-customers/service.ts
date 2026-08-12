import { Prisma } from '@prisma/client'
import type {
  AdminCustomer,
  AdminCustomerListItem,
  AdminCustomerListQuery,
  AdminCustomerStats,
  PaginationMeta,
  UpdateAdminCustomerInput,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { buildMeta, toPrismaPagination } from '../../shared/pagination.js'
import { audit, diff, type AuditContext } from '../../shared/audit.js'
import { conflict, notFound } from '../../shared/errors.js'
import { revokeAllSessions } from '../../shared/refresh-tokens.js'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import {
  ADDRESS_SELECT,
  DETAIL_SELECT,
  EMPTY_STATS,
  LIST_SELECT,
  toListItem,
  type DetailRow,
} from './repository.js'

/** Só dígitos — para buscar CPF/telefone que podem estar gravados com máscara. */
const onlyDigits = (value: string): string => value.replace(/\D/g, '')

const buildWhere = (query: AdminCustomerListQuery): Prisma.CustomerWhereInput => {
  const where: Prisma.CustomerWhereInput = { storeId: getActiveStoreId() }

  // `deletedAt` não entra no where base: o filtro "excluídos" precisa poder ver
  // o oposto, e um `deletedAt: null` fixo o tornaria impossível.
  if (query.status === 'active') where.deletedAt = null
  if (query.status === 'deleted') where.deletedAt = { not: null }

  if (query.verified !== 'all') {
    where.emailVerifiedAt = query.verified === 'yes' ? { not: null } : null
  }
  if (query.marketing !== 'all') where.acceptsMarketing = query.marketing === 'yes'

  if (query.q) {
    const term = query.q.trim()
    const digits = onlyDigits(term)

    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      // Busca pelo texto cru E pelos dígitos: o CPF pode estar gravado com ou
      // sem máscara conforme o fluxo que o preencheu, e quem digita na busca
      // costuma usar os pontos.
      ...(digits.length >= 3
        ? [
            { document: { contains: digits } },
            { document: { contains: term } },
            { phone: { contains: digits } },
            { phone: { contains: term } },
          ]
        : []),
    ]
  }

  return where
}

const parseSort = (
  sort: AdminCustomerListQuery['sort'],
): Prisma.CustomerOrderByWithRelationInput => {
  if (!sort) return { createdAt: 'desc' }
  // `nulls: 'last'` no lastLoginAt: quem nunca acessou não pode ocupar o topo da
  // ordenação por "acesso mais recente".
  if (sort.field === 'lastLoginAt') return { lastLoginAt: { sort: sort.direction, nulls: 'last' } }
  return { [sort.field]: sort.direction }
}

/**
 * Métricas dos N clientes da página em UMA query.
 *
 * `include: { orders: true }` seria N+1 disfarçado de conveniência: o Prisma
 * emite um SELECT por relação e traz o pedido inteiro só para somar um campo.
 */
const statsFor = async (customerIds: string[]): Promise<Map<string, AdminCustomerStats>> => {
  if (customerIds.length === 0) return new Map()

  const grouped = await prisma.order.groupBy({
    by: ['customerId'],
    where: {
      storeId: getActiveStoreId(),
      customerId: { in: customerIds },
      paymentStatus: 'PAID',
    },
    _sum: { total: true },
    _count: { _all: true },
    _max: { createdAt: true },
  })

  return new Map(
    grouped.map((row) => {
      const total = row._sum.total ?? 0
      const count = row._count._all
      return [
        row.customerId,
        {
          ordersCount: count,
          totalSpent: total,
          // Arredondado: dinheiro é centavo inteiro, e meio centavo não existe.
          averageTicket: count > 0 ? Math.round(total / count) : 0,
          lastOrderAt: row._max.createdAt?.toISOString() ?? null,
        },
      ]
    }),
  )
}

export const listCustomers = async (
  query: AdminCustomerListQuery,
): Promise<{ items: AdminCustomerListItem[]; meta: PaginationMeta }> => {
  const where = buildWhere(query)

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: LIST_SELECT,
      orderBy: parseSort(query.sort),
      ...toPrismaPagination(query),
    }),
    prisma.customer.count({ where }),
  ])

  const stats = await statsFor(rows.map((row) => row.id))

  return {
    items: rows.map((row) => toListItem(row, stats.get(row.id) ?? EMPTY_STATS)),
    meta: buildMeta(query, total),
  }
}

/** Posse verificada AQUI, no service: `findUnique({ where: { id } })` devolveria
 *  cliente de outra loja no dia em que existir uma segunda. */
const findOrThrow = async (id: string): Promise<DetailRow> => {
  const customer = await prisma.customer.findFirst({
    where: { id, storeId: getActiveStoreId() },
    select: DETAIL_SELECT,
  })
  if (!customer) throw notFound('Cliente')
  return customer
}

export const getCustomer = async (id: string): Promise<AdminCustomer> => {
  const storeId = getActiveStoreId()
  const customer = await findOrThrow(id)

  const [agg, addresses, views, activeSessions, lastSession, cart, newsletter] = await Promise.all([
    prisma.order.aggregate({
      where: { storeId, customerId: id, paymentStatus: 'PAID' },
      _sum: { total: true },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.address.findMany({
      where: { customerId: id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: ADDRESS_SELECT,
    }),
    // `take` obrigatório: um cliente antigo traria centenas de linhas para uma
    // seção que mostra vinte.
    prisma.customerProductView.findMany({
      where: { customerId: id },
      orderBy: { viewedAt: 'desc' },
      take: 20,
      select: { productId: true, count: true, viewedAt: true },
    }),
    prisma.refreshToken.count({
      where: { customerId: id, revokedAt: null, expiresAt: { gt: new Date() } },
    }),
    prisma.refreshToken.findFirst({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      select: { userAgent: true },
    }),
    prisma.cart.findFirst({
      where: { storeId, customerId: id, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true, _count: { select: { items: true } } },
    }),
    // Cruzamento por E-MAIL: as tabelas não têm relação, e é informativo — os
    // dois consentimentos são independentes e não se sincronizam.
    prisma.newsletterSubscriber.findFirst({
      where: { storeId, email: customer.email },
      select: { createdAt: true, unsubscribedAt: true },
    }),
  ])

  // Nomes dos produtos vistos: UMA query com `in`, o mesmo truque do dashboard.
  const products = views.length
    ? await prisma.product.findMany({
        where: { id: { in: views.map((v) => v.productId) }, storeId },
        select: { id: true, name: true, slug: true },
      })
    : []
  const productById = new Map(products.map((p) => [p.id, p]))

  const ordersCount = agg._count._all
  const totalSpent = agg._sum.total ?? 0

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    emailVerified: customer.emailVerifiedAt !== null,
    acceptsMarketing: customer.acceptsMarketing,
    lastLoginAt: customer.lastLoginAt?.toISOString() ?? null,
    deletedAt: customer.deletedAt?.toISOString() ?? null,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
    document: customer.document,
    documentType: customer.documentType,
    birthDate: customer.birthDate?.toISOString() ?? null,
    stats: {
      ordersCount,
      totalSpent,
      averageTicket: ordersCount > 0 ? Math.round(totalSpent / ordersCount) : 0,
      lastOrderAt: agg._max.createdAt?.toISOString() ?? null,
    },
    addresses,
    // Produto apagado some da lista em vez de virar linha sem nome.
    recentViews: views.flatMap((view) => {
      const product = productById.get(view.productId)
      return product
        ? [
            {
              productId: product.id,
              name: product.name,
              slug: product.slug,
              count: view.count,
              viewedAt: view.viewedAt.toISOString(),
            },
          ]
        : []
    }),
    activity: {
      activeSessions,
      lastDevice: lastSession?.userAgent ?? null,
      hasPassword: customer.passwordHash !== null,
      pendingEmailVerification: customer.emailVerifiedAt === null,
      openCartItems: cart?._count.items ?? 0,
      openCartUpdatedAt: cart?.updatedAt.toISOString() ?? null,
    },
    newsletter: newsletter
      ? {
          subscribedAt: newsletter.createdAt.toISOString(),
          unsubscribedAt: newsletter.unsubscribedAt?.toISOString() ?? null,
        }
      : null,
  }
}

export const updateCustomer = async (
  id: string,
  input: UpdateAdminCustomerInput,
  ctx: AuditContext,
): Promise<AdminCustomer> => {
  const before = await findOrThrow(id)

  // Trocar o e-mail é o caminho mais curto para tomar uma conta: bastaria apontar
  // para um endereço próprio e usar o "esqueci a senha" para receber o link de
  // acesso. Por isso o e-mail novo NASCE NÃO VERIFICADO e as sessões caem — quem
  // prova a posse da caixa é o dono dela, nunca o staff.
  const emailChanged = input.email !== undefined && input.email !== before.email

  try {
    await prisma.customer.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.acceptsMarketing !== undefined
          ? { acceptsMarketing: input.acceptsMarketing }
          : {}),
        ...(emailChanged ? { emailVerifiedAt: null } : {}),
      },
    })
  } catch (err) {
    // P2002 = violação do @@unique([storeId, email]): já existe outro cliente
    // com esse e-mail nesta loja.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('Já existe um cliente com este e-mail.', ERROR_CODES.EMAIL_ALREADY_EXISTS)
    }
    throw err
  }

  // Sessões abertas continuariam válidas com o e-mail antigo — e uma delas pode
  // ser justamente de quem não deveria mais estar na conta.
  if (emailChanged) await revokeAllSessions({ kind: 'customer', id })

  const after = await findOrThrow(id)

  // Fora da transação: auditoria que falha não pode desfazer a correção. O
  // `diff` já redige `document` sozinho (SENSITIVE_FIELDS do audit).
  await audit({
    action: EVENTS.customer.updated,
    entityType: 'Customer',
    entityId: id,
    changes: diff(
      { name: before.name, email: before.email, phone: before.phone, acceptsMarketing: before.acceptsMarketing },
      { name: after.name, email: after.email, phone: after.phone, acceptsMarketing: after.acceptsMarketing },
    ),
    context: ctx,
  })

  return getCustomer(id)
}

/**
 * Anonimização (LGPD). Destrói o dado pessoal e PRESERVA os pedidos: o histórico
 * é obrigação fiscal, e o pedido já guarda o endereço em snapshot próprio.
 * Irreversível — por isso a rota exige ADMIN.
 */
export const anonymizeCustomer = async (id: string, ctx: AuditContext): Promise<AdminCustomer> => {
  await findOrThrow(id)

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id },
      data: {
        name: 'Cliente removido',
        // O e-mail continua sendo único por loja (@@unique([storeId, email])):
        // um literal fixo colidiria no segundo cliente anonimizado.
        email: `anonimizado+${id}@invalido.local`,
        phone: null,
        document: null,
        documentType: null,
        birthDate: null,
        passwordHash: null,
        acceptsMarketing: false,
        deletedAt: new Date(),
      },
    })

    await tx.address.deleteMany({ where: { customerId: id } })
    await tx.customerProductView.deleteMany({ where: { customerId: id } })
    await tx.customerToken.deleteMany({ where: { customerId: id } })
    // Na mesma transação: conta anonimizada com sessão viva ainda abre os
    // pedidos, porque o token carrega o id.
    await revokeAllSessions({ kind: 'customer', id }, tx)
  })

  // SEM `changes`: o diff seria justamente o dado pessoal que esta ação existe
  // para destruir — gravá-lo no AuditLog anularia a anonimização.
  await audit({
    action: EVENTS.customer.anonymized,
    entityType: 'Customer',
    entityId: id,
    context: ctx,
  })

  return getCustomer(id)
}
