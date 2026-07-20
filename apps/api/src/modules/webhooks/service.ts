import { EVENTS } from '@ecommerce/shared/constants'
import { Prisma, type $Enums } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { logger } from '../../config/logger.js'
import { retrievePaymentIntent, type StripeWebhookEvent } from '../../integrations/stripe/index.js'
import { settleOrderReservations } from '../inventory/service.js'

/**
 * Processa um evento do Stripe já verificado. O webhook é A ÚNICA FONTE DE VERDADE
 * do pagamento: é aqui — e só aqui — que um pedido vira PAID e a reserva vira venda.
 *
 * Idempotência em duas camadas, porque o Stripe reentrega em timeout/erro:
 *  1. StripeEvent tem PK = event.id. Já processado (processedAt setado) → sai rápido.
 *  2. Os efeitos são guardados (Order só muda se PENDING; reserva só liquida se não
 *     liberada). Assim, mesmo um evento reentregue ANTES de marcar processedAt (ex.:
 *     crash no meio) reexecuta sem duplicar nada.
 */
export const processStripeEvent = async (event: StripeWebhookEvent): Promise<void> => {
  const rawType = event.type === 'ignored' ? event.rawType : event.type

  const existing = await prisma.stripeEvent.findUnique({
    where: { id: event.id },
    select: { processedAt: true },
  })
  if (existing?.processedAt) {
    logger.info({ eventId: event.id, type: rawType }, 'webhook Stripe: evento já processado, ignorado')
    return
  }
  if (!existing) {
    try {
      await prisma.stripeEvent.create({ data: { id: event.id, type: rawType } })
    } catch (err) {
      // Corrida com outra entrega do mesmo evento: o outro segue, os efeitos são
      // idempotentes. Só relançamos o que não for a colisão esperada.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
    }
  }

  if (event.type === 'payment_intent.succeeded') await handleSucceeded(event)
  else if (event.type === 'payment_intent.payment_failed') await handleFailed(event)
  else if (event.type === 'charge.refunded') await handleRefunded(event)
  else logger.info({ eventId: event.id, type: rawType }, 'webhook Stripe: evento sem handler')

  await prisma.stripeEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } })
}

const mapMethod = (type: string | null): $Enums.PaymentMethod | null => {
  if (type === 'card') return 'CARD'
  if (type === 'pix') return 'PIX'
  if (type === 'boleto') return 'BOLETO'
  return null
}

const handleSucceeded = async (
  event: Extract<StripeWebhookEvent, { type: 'payment_intent.succeeded' }>,
): Promise<void> => {
  // Enriquece com a cobrança (id + método efetivo) — o evento traz só o PI.
  const details = await retrievePaymentIntent(event.paymentIntentId)
  const method = mapMethod(details.paymentMethodType)

  await prisma.$transaction(async (tx) => {
    // PROCESSING → PAID. updateMany é no-op se não houver Payment (ex.: PI de teste
    // do `stripe trigger`, sem pedido nosso).
    await tx.payment.updateMany({
      where: { stripePaymentIntentId: event.paymentIntentId },
      data: { status: 'PAID', paidAt: new Date(), stripeChargeId: details.chargeId, method },
    })

    const payment = await tx.payment.findUnique({
      where: { stripePaymentIntentId: event.paymentIntentId },
      select: { orderId: true, storeId: true },
    })
    const orderId = payment?.orderId ?? event.orderId
    if (!orderId) {
      logger.warn({ pi: event.paymentIntentId }, 'webhook Stripe: succeeded sem pedido casado')
      return
    }

    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, storeId: true, paymentStatus: true },
    })
    // Já não-PENDING (reprocesso, cancelado): nada a fazer — idempotente.
    if (!order || order.paymentStatus !== 'PENDING') return

    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'PAID' } })
    await tx.orderEvent.create({
      data: { orderId, type: EVENTS.order.paid, description: 'Pagamento confirmado' },
    })

    // A reserva vira venda: SALE no ledger + libera a reserva.
    await settleOrderReservations(tx, order.storeId, orderId)
  })

  logger.info({ pi: event.paymentIntentId, orderId: event.orderId }, 'webhook Stripe: pagamento confirmado')
}

/**
 * Reembolso confirmado pelo Stripe. O admin PEDE o reembolso; quem o registra é
 * este handler — mesma disciplina do pagamento, para que o status do pedido nunca
 * afirme algo que o Stripe não confirmou.
 *
 * `amountRefunded` é o ACUMULADO do charge, então gravá-lo direto (não somar) é o
 * que torna a reentrega idempotente de graça: dois reembolsos parciais chegam
 * como 3000 e depois 5000, nunca como dois "+3000".
 *
 * Sem efeito de estoque: reembolsar não é receber a peça de volta. A devolução
 * física é um RETURN na tela de Estoque, ou o CANCELLATION do cancelamento.
 */
const handleRefunded = async (
  event: Extract<StripeWebhookEvent, { type: 'charge.refunded' }>,
): Promise<void> => {
  const status: $Enums.PaymentStatus = event.fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED'

  await prisma.$transaction(async (tx) => {
    // O PI é a chave natural; o charge é o fallback para eventos que cheguem sem
    // payment_intent expandido.
    const where = event.paymentIntentId
      ? { stripePaymentIntentId: event.paymentIntentId }
      : { stripeChargeId: event.chargeId }

    await tx.payment.updateMany({
      where,
      data: { status, refundedAmount: event.amountRefunded, refundedAt: new Date() },
    })

    const payment = await tx.payment.findFirst({ where, select: { orderId: true } })
    if (!payment) {
      logger.warn({ charge: event.chargeId }, 'webhook Stripe: refunded sem pagamento casado')
      return
    }

    const order = await tx.order.findUnique({
      where: { id: payment.orderId },
      select: { paymentStatus: true },
    })
    // Só sai de PAID/PARTIALLY_REFUNDED: um pedido que nunca chegou a PAID não
    // pode retroceder para "reembolsado" por um evento fora de ordem.
    if (!order || (order.paymentStatus !== 'PAID' && order.paymentStatus !== 'PARTIALLY_REFUNDED')) {
      return
    }

    await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: status } })
    await tx.orderEvent.create({
      data: {
        orderId: payment.orderId,
        type: EVENTS.order.refunded,
        description: event.fullyRefunded
          ? 'Reembolso total confirmado'
          : 'Reembolso parcial confirmado',
        metadataJson: {
          chargeId: event.chargeId,
          amountRefunded: event.amountRefunded,
          amountTotal: event.amountTotal,
        },
      },
    })
  })

  logger.info(
    { charge: event.chargeId, amountRefunded: event.amountRefunded, status },
    'webhook Stripe: reembolso registrado',
  )
}

const handleFailed = async (
  event: Extract<StripeWebhookEvent, { type: 'payment_intent.payment_failed' }>,
): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { stripePaymentIntentId: event.paymentIntentId },
      data: { status: 'FAILED' },
    })

    const payment = await tx.payment.findUnique({
      where: { stripePaymentIntentId: event.paymentIntentId },
      select: { orderId: true },
    })
    const orderId = payment?.orderId ?? event.orderId
    if (!orderId) return

    // O pedido SEGUE PENDING de propósito: a reserva continua e o cliente pode
    // retentar dentro da janela (TTL). Quem libera a reserva é a expiração (fase
    // posterior), não a falha. Só registramos o fato na timeline.
    await tx.orderEvent.create({
      data: { orderId, type: EVENTS.order.paymentFailed, description: 'Pagamento não aprovado' },
    })
  })

  logger.info({ pi: event.paymentIntentId }, 'webhook Stripe: pagamento falhou')
}
