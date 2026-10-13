'use client'

import { ROUTES } from '@ecommerce/shared/constants'
import type {
  CardPaymentResult,
  ConfirmCheckoutInput,
  CreateCardPaymentInput,
  CustomerOrder,
  Order,
  OrderPayment,
  OrderStatus,
  PixCharge,
} from '@ecommerce/shared/contracts'
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

export const getOrder = (id: string): Promise<CustomerOrder> => call<CustomerOrder>(ROUTES.orders.detail(id))

/**
 * O que a tela de pagamento precisa, conforme o provedor ativo na API. No Stripe
 * isto cria/reusa o PaymentIntent; no Mercado Pago só lê (nada é cobrado ao abrir).
 */
export const getOrderPayment = (id: string): Promise<OrderPayment> =>
  call<OrderPayment>(ROUTES.orders.payment(id))

/** Gera o Pix — ou devolve o que ainda está em aberto. */
export const createPixPayment = (id: string): Promise<PixCharge> =>
  call<PixCharge>(ROUTES.orders.paymentPix(id), { method: 'POST' })

/** Recusa vem como ApiError PAYMENT_DECLINED, com o motivo em details. */
export const createCardPayment = (id: string, input: CreateCardPaymentInput): Promise<CardPaymentResult> =>
  call<CardPaymentResult>(ROUTES.orders.paymentCard(id), { method: 'POST', body: JSON.stringify(input) })

/** Status enxuto para o polling da tela de pagamento. */
export const getOrderStatus = (id: string): Promise<OrderStatus> =>
  call<OrderStatus>(ROUTES.orders.status(id))
