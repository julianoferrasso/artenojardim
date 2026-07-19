import type { Order, OrderStatus } from '@ecommerce/shared/contracts'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { notFound } from '../../shared/errors.js'

/**
 * Leitura de pedidos. A posse é SEMPRE pelo customerId — trocar o id na URL não
 * alcança o pedido de outro cliente (IDOR). O pedido é snapshot: endereço e frete
 * saem do Json congelado no momento da compra, não do cadastro atual.
 */

const ORDER_SELECT = {
  id: true,
  number: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  email: true,
  subtotal: true,
  discountTotal: true,
  shippingTotal: true,
  total: true,
  shippingAddressJson: true,
  shippingMethodJson: true,
  customerNote: true,
  createdAt: true,
  items: {
    orderBy: { id: 'asc' },
    select: {
      id: true,
      productName: true,
      variantName: true,
      sku: true,
      unitPrice: true,
      quantity: true,
      totalPrice: true,
      imageUrl: true,
    },
  },
} satisfies Prisma.OrderSelect

type OrderRow = Prisma.OrderGetPayload<{ select: typeof ORDER_SELECT }>

export const toOrderDTO = (row: OrderRow): Order => ({
  id: row.id,
  number: row.number,
  paymentStatus: row.paymentStatus,
  fulfillmentStatus: row.fulfillmentStatus,
  email: row.email,
  subtotal: row.subtotal,
  discountTotal: row.discountTotal,
  shippingTotal: row.shippingTotal,
  total: row.total,
  shippingAddress: row.shippingAddressJson as Order['shippingAddress'],
  shippingMethod: row.shippingMethodJson as Order['shippingMethod'],
  items: row.items.map((i) => ({
    id: i.id,
    productName: i.productName,
    variantName: i.variantName,
    sku: i.sku,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    totalPrice: i.totalPrice,
    imageUrl: i.imageUrl,
  })),
  customerNote: row.customerNote,
  createdAt: row.createdAt.toISOString(),
})

export const getOrder = async (customerId: string, id: string): Promise<Order> => {
  const row = await prisma.order.findFirst({
    where: { id, customerId, storeId: getActiveStoreId() },
    select: ORDER_SELECT,
  })
  if (!row) throw notFound('Pedido')
  return toOrderDTO(row)
}

export const getOrderStatus = async (customerId: string, id: string): Promise<OrderStatus> => {
  const row = await prisma.order.findFirst({
    where: { id, customerId, storeId: getActiveStoreId() },
    select: { id: true, paymentStatus: true, fulfillmentStatus: true },
  })
  if (!row) throw notFound('Pedido')
  return row
}

export const listOrders = async (customerId: string): Promise<Order[]> => {
  const rows = await prisma.order.findMany({
    where: { customerId, storeId: getActiveStoreId() },
    orderBy: { createdAt: 'desc' },
    select: ORDER_SELECT,
  })
  return rows.map(toOrderDTO)
}
