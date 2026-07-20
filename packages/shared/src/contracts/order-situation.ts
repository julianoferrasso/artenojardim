import { z } from 'zod'
import type { PaymentStatus, FulfillmentStatus } from '../constants/enums.js'

/**
 * A situação de um pedido — a lógica PURA que admin e loja compartilham.
 *
 * O banco guarda DOIS eixos independentes (paymentStatus e fulfillmentStatus)
 * porque um pedido pago pode estar em qualquer ponto da expedição. Quem olha a
 * tela, porém, pensa em UM estado: "onde este pedido está agora?".
 *
 * A conciliação é `deriveSituation` — usada pelo chip da lista E pelo filtro do
 * backend (via `situationFilter`). Ter os dois lados saindo da mesma fonte é o
 * que impede a lista filtrada por "Enviado" mostrar um pedido que o detalhe
 * chama de outra coisa.
 *
 * Vive fora de `admin-orders.ts` porque a área do cliente precisa das mesmas
 * funções — e a loja não deve importar de um arquivo chamado "admin".
 */

export const ORDER_SITUATIONS = [
  'AWAITING_PAYMENT',
  'PAYMENT_FAILED',
  'PAID',
  'PICKING',
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
  'CANCELED',
  'REFUNDED',
] as const

export const orderSituationSchema = z.enum(ORDER_SITUATIONS)
export type OrderSituation = z.infer<typeof orderSituationSchema>

export type SituationInput = {
  canceledAt: string | Date | null
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
}

/**
 * Precedência: cancelado > reembolsado > logística > pagamento.
 *
 * Cancelado vence tudo porque é o fim da linha operacional — não importa que a
 * expedição diga PICKING, ninguém vai separar. Reembolsado vem antes da
 * logística pela mesma razão: dinheiro devolvido encerra o caso.
 */
export const deriveSituation = (o: SituationInput): OrderSituation => {
  if (o.canceledAt) return 'CANCELED'
  if (o.paymentStatus === 'REFUNDED' || o.paymentStatus === 'PARTIALLY_REFUNDED') return 'REFUNDED'

  switch (o.fulfillmentStatus) {
    case 'RETURNED':
      return 'RETURNED'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'SHIPPED':
      return 'SHIPPED'
    case 'PICKING':
    case 'READY_TO_SHIP':
      return 'PICKING'
    case 'UNFULFILLED':
      break
  }

  if (o.paymentStatus === 'PAID') return 'PAID'
  if (o.paymentStatus === 'FAILED') return 'PAYMENT_FAILED'
  return 'AWAITING_PAYMENT'
}

/**
 * Inverso de `deriveSituation`: descritor NEUTRO (sem Prisma) que o service
 * traduz em `where`. Fica aqui, e não no service, para nascer e morrer junto da
 * função que deriva — mudar uma sem a outra é o bug que este arquivo evita.
 */
export type SituationFilter = {
  canceled?: boolean
  paymentStatus?: readonly PaymentStatus[]
  fulfillmentStatus?: readonly FulfillmentStatus[]
}

const REFUNDED_PAYMENTS = ['REFUNDED', 'PARTIALLY_REFUNDED'] as const
const LIVE_PAYMENTS = ['PENDING', 'PROCESSING', 'PAID', 'FAILED'] as const

export const situationFilter = (s: OrderSituation): SituationFilter => {
  switch (s) {
    case 'CANCELED':
      return { canceled: true }
    case 'REFUNDED':
      return { canceled: false, paymentStatus: REFUNDED_PAYMENTS }
    case 'RETURNED':
      return { canceled: false, paymentStatus: LIVE_PAYMENTS, fulfillmentStatus: ['RETURNED'] }
    case 'DELIVERED':
      return { canceled: false, paymentStatus: LIVE_PAYMENTS, fulfillmentStatus: ['DELIVERED'] }
    case 'SHIPPED':
      return { canceled: false, paymentStatus: LIVE_PAYMENTS, fulfillmentStatus: ['SHIPPED'] }
    case 'PICKING':
      return {
        canceled: false,
        paymentStatus: LIVE_PAYMENTS,
        fulfillmentStatus: ['PICKING', 'READY_TO_SHIP'],
      }
    case 'PAID':
      return { canceled: false, paymentStatus: ['PAID'], fulfillmentStatus: ['UNFULFILLED'] }
    case 'PAYMENT_FAILED':
      return { canceled: false, paymentStatus: ['FAILED'], fulfillmentStatus: ['UNFULFILLED'] }
    case 'AWAITING_PAYMENT':
      return {
        canceled: false,
        paymentStatus: ['PENDING', 'PROCESSING'],
        fulfillmentStatus: ['UNFULFILLED'],
      }
  }
}

/**
 * Transições de expedição permitidas ao admin.
 *
 * Não há volta de SHIPPED: a etiqueta já foi comprada e o pacote saiu — o
 * caminho de volta do mundo real é RETURNED, não "desfazer". As voltas curtas
 * (PICKING → UNFULFILLED) existem porque clicar errado no menu é comum e nada
 * físico aconteceu ainda.
 */
export const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, readonly FulfillmentStatus[]> = {
  UNFULFILLED: ['PICKING'],
  PICKING: ['READY_TO_SHIP', 'UNFULFILLED'],
  READY_TO_SHIP: ['SHIPPED', 'PICKING'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  RETURNED: [],
}

export type TransitionContext = {
  paymentStatus: PaymentStatus
  canceled: boolean
}

/**
 * Separar o que não foi pago é o erro operacional caro: o produto sai da
 * prateleira, alguém embala, e o pagamento nunca vem. Por isso sair de
 * UNFULFILLED exige PAID.
 */
export const canTransitionFulfillment = (
  from: FulfillmentStatus,
  to: FulfillmentStatus,
  ctx: TransitionContext,
): boolean => {
  if (ctx.canceled) return false
  if (!FULFILLMENT_TRANSITIONS[from].includes(to)) return false
  if (from === 'UNFULFILLED' && to === 'PICKING') return ctx.paymentStatus === 'PAID'
  return true
}

/** Cancelar depois que o pacote saiu não é cancelar — é devolução. */
export const CANCELABLE_FULFILLMENTS: readonly FulfillmentStatus[] = ['UNFULFILLED', 'PICKING']

export const canCancelOrder = (o: {
  canceledAt: string | Date | null
  fulfillmentStatus: FulfillmentStatus
}): boolean => !o.canceledAt && CANCELABLE_FULFILLMENTS.includes(o.fulfillmentStatus)
