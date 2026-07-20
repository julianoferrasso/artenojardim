import {
  situationFilter,
  periodStart,
  customerCancelMode,
  ERROR_CODES,
  type CustomerOrder,
  type CustomerOrderListItem,
  type CustomerOrderListQuery,
  type CustomerCancelInput,
  type SupportMessageInput,
  type ReorderResult,
  type OrderStatus,
  type PaginationMeta,
} from '@ecommerce/shared/contracts'
import { EVENTS, SUPPORT_TOPIC_LABEL } from '@ecommerce/shared/constants'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { notFound, conflict } from '../../shared/errors.js'
import { toPrismaPagination, buildMeta } from '../../shared/pagination.js'
import { cancelOrderInternal } from '../admin-orders/service.js'
import { resolveCart, addItems } from '../cart/service.js'
import {
  CUSTOMER_LIST_SELECT,
  CUSTOMER_ORDER_SELECT,
  toCustomerListItem,
  toCustomerOrderDTO,
} from './repository.js'

/**
 * Pedidos na visão de quem comprou.
 *
 * A posse é SEMPRE pelo customerId — trocar o id na URL não alcança o pedido de
 * outro cliente (IDOR). `authenticateCustomer` responde "quem é você"; é aqui
 * que se responde "isto é seu". O pedido é snapshot: endereço e frete saem do
 * Json congelado no momento da compra, não do cadastro atual.
 */

const findOwnedOrThrow = async <T extends Prisma.OrderSelect>(
  customerId: string,
  id: string,
  select: T,
): Promise<Prisma.OrderGetPayload<{ select: T }>> => {
  const row = await prisma.order.findFirst({
    where: { id, customerId, storeId: getActiveStoreId() },
    select,
  })
  // 404 e não 403: dizer "existe, mas não é seu" já entrega que o pedido existe.
  if (!row) throw notFound('Pedido')
  return row as Prisma.OrderGetPayload<{ select: T }>
}

// ── Leitura ──────────────────────────────────────────────────────────────────

const parseSort = (sort: CustomerOrderListQuery['sort']): Prisma.OrderOrderByWithRelationInput => {
  const desc = sort.startsWith('-')
  const field = desc ? sort.slice(1) : sort
  const direction = desc ? 'desc' : 'asc'

  switch (field) {
    case 'total':
      return { total: direction }
    case 'number':
      return { number: direction }
    default:
      return { createdAt: direction }
  }
}

const buildWhere = (customerId: string, query: CustomerOrderListQuery): Prisma.OrderWhereInput => {
  const where: Prisma.OrderWhereInput = { customerId, storeId: getActiveStoreId() }

  if (query.situation) {
    // Via situationFilter, e não um where artesanal: é o que impede a lista
    // filtrada por "Enviado" mostrar um pedido cujo chip diz outra coisa.
    const filter = situationFilter(query.situation)
    if (filter.canceled === true) where.canceledAt = { not: null }
    if (filter.canceled === false) where.canceledAt = null
    if (filter.paymentStatus) where.paymentStatus = { in: [...filter.paymentStatus] }
    if (filter.fulfillmentStatus) where.fulfillmentStatus = { in: [...filter.fulfillmentStatus] }
  }

  const start = periodStart(query.period, new Date())
  if (start) where.createdAt = { gte: start }

  if (query.q) {
    // "#1042" e "1042" são a mesma busca — o cliente copia o número com o
    // cerquilha que a própria tela mostra.
    const digits = query.q.replace(/^#/, '')
    const asNumber = /^\d+$/.test(digits) ? Number(digits) : null

    if (asNumber !== null && Number.isSafeInteger(asNumber)) {
      where.number = asNumber
    } else {
      where.items = { some: { productName: { contains: query.q, mode: 'insensitive' } } }
    }
  }

  return where
}

export const listOrders = async (
  customerId: string,
  query: CustomerOrderListQuery,
): Promise<{ items: CustomerOrderListItem[]; meta: PaginationMeta }> => {
  const where = buildWhere(customerId, query)

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: CUSTOMER_LIST_SELECT,
      orderBy: parseSort(query.sort),
      ...toPrismaPagination(query),
    }),
    prisma.order.count({ where }),
  ])

  return { items: rows.map(toCustomerListItem), meta: buildMeta(query, total) }
}

export const getOrder = async (customerId: string, id: string): Promise<CustomerOrder> =>
  toCustomerOrderDTO(await findOwnedOrThrow(customerId, id, CUSTOMER_ORDER_SELECT))

export const getOrderStatus = async (customerId: string, id: string): Promise<OrderStatus> => {
  const row = await findOwnedOrThrow(customerId, id, {
    id: true,
    paymentStatus: true,
    fulfillmentStatus: true,
  })
  return row
}

// ── Cancelamento ─────────────────────────────────────────────────────────────

/**
 * Duas saídas, decididas por `customerCancelMode`:
 *
 * IMMEDIATE — nada foi pago e ninguém tirou produto da prateleira: cancela de
 * verdade, reusando a transação do admin (estoque volta pelo mesmo caminho).
 *
 * REQUEST — há dinheiro ou trabalho envolvido: registra a solicitação na
 * timeline e não muda estado nenhum. Quem decide estorno é o staff, no admin.
 *
 * `paymentStatus` não é tocado em nenhum dos dois ramos: só o webhook do Stripe
 * escreve pagamento (regra 6).
 */
export const cancelOrder = async (
  customerId: string,
  id: string,
  input: CustomerCancelInput,
): Promise<CustomerOrder> => {
  const row = await findOwnedOrThrow(customerId, id, CUSTOMER_ORDER_SELECT)
  const mode = customerCancelMode(row)

  if (mode === 'NONE') {
    throw conflict(
      'Este pedido não pode mais ser cancelado. Fale com o suporte.',
      ERROR_CODES.ORDER_NOT_CANCELABLE,
    )
  }

  if (mode === 'IMMEDIATE') {
    await cancelOrderInternal(id, input.reason, { kind: 'customer' })
    return getOrder(customerId, id)
  }

  const alreadyRequested = row.events.some((e) => e.type === EVENTS.order.cancelRequested)
  if (alreadyRequested) {
    throw conflict(
      'Você já solicitou o cancelamento deste pedido. Nossa equipe está analisando.',
      ERROR_CODES.CONFLICT,
    )
  }

  await prisma.orderEvent.create({
    data: {
      orderId: id,
      type: EVENTS.order.cancelRequested,
      description: input.reason,
      metadataJson: { by: 'customer' },
      userId: null,
    },
  })

  return getOrder(customerId, id)
}

// ── Suporte ──────────────────────────────────────────────────────────────────

/**
 * A mensagem vira um evento na timeline do pedido — é onde o staff já olha
 * quando o assunto é "o que houve com o 1042?". Não publica em fila: o evento
 * não tem consumidor (regra 9), e uma fila sem worker seria só uma mensagem
 * apodrecendo.
 */
export const sendSupportMessage = async (
  customerId: string,
  id: string,
  input: SupportMessageInput,
): Promise<CustomerOrder> => {
  await findOwnedOrThrow(customerId, id, { id: true })

  await prisma.orderEvent.create({
    data: {
      orderId: id,
      type: EVENTS.order.supportMessage,
      description: `[${SUPPORT_TOPIC_LABEL[input.topic]}] ${input.message}`,
      metadataJson: { by: 'customer', topic: input.topic },
      userId: null,
    },
  })

  return getOrder(customerId, id)
}

// ── Comprar de novo ──────────────────────────────────────────────────────────

/**
 * Repõe no carrinho o que ainda dá para comprar, e reporta o que não dá.
 *
 * Falha parcial é o caso esperado — variante apagada, produto despublicado,
 * estoque menor que o comprado. Por isso não estoura no primeiro item
 * indisponível: o cliente prefere levar 4 dos 6 itens sabendo quais faltaram a
 * receber um erro e um carrinho vazio.
 */
export const reorder = async (customerId: string, id: string): Promise<ReorderResult> => {
  const row = await findOwnedOrThrow(customerId, id, {
    items: {
      orderBy: { id: 'asc' },
      select: { variantId: true, productName: true, quantity: true },
    },
  })

  const skipped: ReorderResult['skipped'] = []
  const wanted: { variantId: string; productName: string; quantity: number }[] = []

  for (const item of row.items) {
    if (!item.variantId) {
      // Variante apagada do catálogo (SetNull) — não há o que recomprar.
      skipped.push({
        productName: item.productName,
        reason: 'UNAVAILABLE',
        requested: item.quantity,
        added: 0,
      })
      continue
    }
    wanted.push({
      variantId: item.variantId,
      productName: item.productName,
      quantity: item.quantity,
    })
  }

  if (wanted.length === 0) return { added: [], skipped }

  // Cliente logado: o dono do carrinho é sempre o customerId, sem cookie de
  // sessão no meio — por isso a rota pode viver em `orders`.
  const { cartId } = await resolveCart({ customerId })
  const result = await addItems(cartId, wanted)

  return { added: result.added, skipped: [...skipped, ...result.skipped] }
}
