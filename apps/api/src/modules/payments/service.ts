import type { OrderPayment } from '@ecommerce/shared/contracts'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { notFound } from '../../shared/errors.js'
import {
  createPaymentIntent,
  retrievePaymentIntent,
  getPublishableKey,
  type PaymentIntentResult,
} from '../../integrations/stripe/index.js'

/**
 * Garante um PaymentIntent para o pedido e devolve o que o Payment Element precisa
 * (clientSecret + publishable). Idempotente por desenho:
 *
 *  - Já existe um Payment do pedido → reusa o PI (recarregar a tela, retentar).
 *  - Não existe → cria o PI (idempotencyKey=orderId no Stripe: uma corrida entre
 *    duas chamadas resolve no MESMO PI) e grava o Payment. O @unique em
 *    stripePaymentIntentId barra o segundo insert numa corrida (P2002 → relê).
 *
 * Posse reforçada AQUI, não só na rota: o pedido tem de ser do cliente (anti-IDOR).
 * O status do pagamento continua sendo escrito só pelo webhook — este fluxo nunca
 * marca PAID; no máximo cria o Payment em PROCESSING.
 */
export const ensureOrderPayment = async (
  customerId: string,
  orderId: string,
): Promise<OrderPayment> => {
  const storeId = getActiveStoreId()

  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId, storeId },
    select: { id: true, number: true, total: true },
  })
  if (!order) throw notFound('Pedido')

  const existing = await prisma.payment.findFirst({
    where: { orderId, storeId },
    orderBy: { createdAt: 'desc' },
    select: { stripePaymentIntentId: true },
  })

  if (existing) {
    const pi = await retrievePaymentIntent(existing.stripePaymentIntentId)
    return toOrderPayment(pi)
  }

  const pi = await createPaymentIntent({
    orderId,
    amountCents: order.total,
    metadata: { orderNumber: String(order.number), storeId },
  })

  try {
    await prisma.payment.create({
      data: {
        storeId,
        orderId,
        stripePaymentIntentId: pi.id,
        amount: order.total,
        currency: pi.currency,
        // status default = PROCESSING; só o webhook o move para PAID/FAILED.
      },
    })
  } catch (err) {
    // Corrida: outra chamada gravou este mesmo PI (mesmo idempotencyKey → mesmo
    // id). O unique barrou o segundo insert; seguimos, o PI é o mesmo.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
  }

  return toOrderPayment(pi)
}

const toOrderPayment = (pi: PaymentIntentResult): OrderPayment => ({
  paymentIntentId: pi.id,
  clientSecret: pi.clientSecret ?? '',
  publishableKey: getPublishableKey() ?? '',
  status: pi.status,
})
