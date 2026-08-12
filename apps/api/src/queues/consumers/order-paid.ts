import { EVENTS } from '@ecommerce/shared/constants'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { prisma } from '../../config/prisma.js'
import { publish } from '../../shared/publish.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { formatBRL } from '../../utils/money.js'
import { permanentError } from '../consumer.js'
import type { OrderEmailData } from './render-order.js'

/**
 * Orquestrador do pós-pagamento (arquitetura §12).
 *
 * É o lugar ÚNICO que responde "o que acontece quando um pedido é pago?". Hoje
 * responde "manda a confirmação"; amanhã, quando entrar a compra de etiqueta ou
 * um envio para o ERP, entra aqui — sem tocar no webhook do Stripe, que só sabe
 * registrar o fato.
 */

export type OrderPaidJob = { orderId: string }

type AddressSnapshot = {
  street?: string
  number?: string
  complement?: string | null
  district?: string
  city?: string
  state?: string
  zipCode?: string
}

/** Uma linha só, do jeito que cabe num parágrafo de e-mail. */
const formatAddress = (raw: unknown): string => {
  const a = (raw ?? {}) as AddressSnapshot
  const line = [a.street, a.number].filter(Boolean).join(', ')
  const withComplement = [line, a.complement].filter(Boolean).join(' — ')
  const cityState = [a.city, a.state].filter(Boolean).join('/')
  return [withComplement, a.district, cityState, a.zipCode].filter(Boolean).join(', ')
}

const deliveryDaysOf = (raw: unknown): number | null => {
  const days = (raw as { deliveryDays?: unknown } | null)?.deliveryDays
  return typeof days === 'number' && days > 0 ? days : null
}

export const orderPaidHandler = async (job: OrderPaidJob): Promise<void> => {
  const order = await prisma.order.findFirst({
    // storeId no filtro mesmo com o id em mãos: é a regra que compra o
    // multi-tenant da Fase 4, e uma exceção aqui é a que ninguém revisa depois.
    where: { id: job.orderId, storeId: getActiveStoreId() },
    select: {
      id: true,
      number: true,
      email: true,
      subtotal: true,
      discountTotal: true,
      shippingTotal: true,
      total: true,
      shippingAddressJson: true,
      shippingMethodJson: true,
      customer: { select: { name: true } },
      items: {
        orderBy: { id: 'asc' },
        select: { productName: true, variantName: true, quantity: true, totalPrice: true },
      },
    },
  })

  if (!order) {
    // Pedido apagado entre a publicação e o consumo. Retry não traz de volta.
    throw permanentError(`pedido ${job.orderId} não encontrado`)
  }

  const data: OrderEmailData = {
    orderNumber: order.number,
    customerName: order.customer.name,
    // A tela permanente do histórico, não a de checkout — aquela morre quando o
    // pagamento termina, e este e-mail é consultado meses depois.
    orderUrl: `${env.STORE_URL.replace(/\/$/, '')}/conta/pedidos/${order.id}`,
    items: order.items.map((item) => ({
      label: item.variantName ? `${item.productName} (${item.variantName})` : item.productName,
      qty: item.quantity,
      price: formatBRL(item.totalPrice),
    })),
    totals: [
      { label: 'Subtotal', value: formatBRL(order.subtotal) },
      ...(order.discountTotal > 0
        ? [{ label: 'Desconto', value: `− ${formatBRL(order.discountTotal)}` }]
        : []),
      { label: 'Frete', value: formatBRL(order.shippingTotal) },
      { label: 'Total', value: formatBRL(order.total), strong: true },
    ],
    shippingAddress: formatAddress(order.shippingAddressJson),
    estimatedDelivery: (() => {
      const days = deliveryDaysOf(order.shippingMethodJson)
      return days ? `${days} dia${days > 1 ? 's' : ''} útil${days > 1 ? 'eis' : ''} após o envio` : null
    })(),
  }

  await publish(EVENTS.email.orderConfirmation, {
    template: 'order_confirmation',
    to: order.email,
    data,
  })

  logger.info({ orderId: order.id, number: order.number }, 'confirmação de pedido enfileirada')
}
