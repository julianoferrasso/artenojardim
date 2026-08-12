'use client'

import { ROUTES } from '@ecommerce/shared/constants'
import type { ConfirmCheckoutInput, Order, OrderPayment, OrderStatus } from '@ecommerce/shared/contracts'
import { clientFetch as call } from './client'

/**
 * Checkout e pedidos no browser. Usa o `clientFetch` compartilhado, que anexa o
 * Bearer em memória e RENOVA a sessão no 401 — sem isso, quem demorava mais de
 * 15 minutos escolhendo o frete via a confirmação falhar no fim do funil, que é
 * abandono de compra.
 *
 * O front manda só ids e escolhas: o backend recalcula tudo e devolve o pedido.
 */

export const confirmCheckout = (input: ConfirmCheckoutInput): Promise<Order> =>
  call<Order>(ROUTES.checkout.confirm, { method: 'POST', body: JSON.stringify(input) })

export const getOrder = (id: string): Promise<Order> => call<Order>(ROUTES.orders.detail(id))

/** Cria/reusa o PaymentIntent do pedido e devolve clientSecret + publishable. */
export const getOrderPayment = (id: string): Promise<OrderPayment> =>
  call<OrderPayment>(ROUTES.orders.payment(id))

/** Status enxuto para o polling da tela de pagamento (a verdade é o webhook). */
export const getOrderStatus = (id: string): Promise<OrderStatus> =>
  call<OrderStatus>(ROUTES.orders.status(id))
