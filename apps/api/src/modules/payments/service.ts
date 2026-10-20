import { createHash } from 'node:crypto'
import {
  ERROR_CODES,
  orderAddressSchema,
  orderShippingMethodSchema,
  type CardPaymentResult,
  type CreateCardPaymentInput,
  type MercadoPagoOrderPayment,
  type OrderPayment,
  type PixCharge,
  type RefundOrderInput,
} from '@ecommerce/shared/contracts'
import { EVENTS, type PaymentMethod, type PaymentStatus } from '@ecommerce/shared/constants'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { env, mercadoPagoConfig } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { appError, businessError, conflict, notFound } from '../../shared/errors.js'
import { getSetting } from '../../shared/settings.js'
import { publish } from '../../shared/publish.js'
import {
  createPaymentIntent,
  createRefund,
  retrievePaymentIntent,
  getPublishableKey,
  type PaymentIntentResult,
} from '../../integrations/stripe/index.js'
import {
  cancelMpOrder,
  createCardOrder,
  createPixOrder,
  getMpOrder,
  getMpPublicKey,
  refundMpOrder,
  type MpItem,
  type MpOrderSnapshot,
  type MpPayer,
} from '../../integrations/mercadopago/index.js'
import { settleOrderReservations, extendOrderReservations } from '../inventory/service.js'
import { notifyOrderRefunded, notifyRefundFailed } from '../notifications/service.js'
import { decideMercadoPagoTransition, mpPaymentMethod } from './domain/mercadopago-transition.js'
import {
  refundableOf,
  refundIdempotencyKey,
  refundMovesOrder,
  type AutoRefundOutcome,
  type RefundActor,
} from './domain/refund.js'

/**
 * Pagamentos. O provedor dos pagamentos NOVOS vem de PAYMENT_PROVIDER: Mercado
 * Pago (ativo) ou Stripe (standby). Reembolso e cancelamento seguem o provedor
 * gravado em cada Payment, não a env.
 *
 * Regra 6, versão Mercado Pago: o status só muda pelo estado que o MP confirma ao
 * SERVIDOR — a resposta servidor-a-servidor (o cartão é síncrono) ou o webhook —
 * e os dois passam por `applyMercadoPagoOrder`, a única função que escreve status.
 * Nada que venha do front decide pagamento.
 */

// ── Despacho ─────────────────────────────────────────────────────────────────

/** O que a tela de pagamento precisa para abrir, conforme o provedor ativo. */
export const getOrderPayment = async (customerId: string, orderId: string): Promise<OrderPayment> =>
  env.PAYMENT_PROVIDER === 'stripe'
    ? ensureOrderPayment(customerId, orderId)
    : getMercadoPagoCheckout(customerId, orderId)

const assertMercadoPagoActive = (): void => {
  if (env.PAYMENT_PROVIDER !== 'mercadopago') {
    throw conflict('Este meio de pagamento não está disponível no momento.')
  }
}

// ── Stripe (standby) ─────────────────────────────────────────────────────────

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
    where: { orderId, storeId, provider: 'STRIPE', stripePaymentIntentId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { stripePaymentIntentId: true },
  })

  if (existing?.stripePaymentIntentId) {
    const pi = await retrievePaymentIntent(existing.stripePaymentIntentId)
    return toStripePayment(pi)
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
        provider: 'STRIPE',
        stripePaymentIntentId: pi.id,
        amount: order.total,
        currency: pi.currency,
        // status default = PROCESSING; só o webhook o move para PAID/FAILED.
      },
    })
  } catch (err) {
    // Corrida: outra chamada gravou este mesmo PI (mesmo idempotencyKey → mesmo
    // id). O unique barrou o segundo insert; seguimos, o PI é o mesmo.
    if (!isUniqueViolation(err)) throw err
  }

  return toStripePayment(pi)
}

const toStripePayment = (pi: PaymentIntentResult): OrderPayment => ({
  provider: 'STRIPE',
  paymentIntentId: pi.id,
  clientSecret: pi.clientSecret ?? '',
  publishableKey: getPublishableKey() ?? '',
  status: pi.status,
})

// ── Mercado Pago: abrir a tela ───────────────────────────────────────────────

/** Margem para não reaproveitar um Pix que venceria enquanto o cliente abre o banco. */
const PIX_REUSE_MARGIN_MS = 2 * 60_000
/** O MP recusa Pix com validade abaixo de 30 minutos. */
const PIX_MIN_MINUTES = 30

const PAYABLE_ORDER_SELECT = {
  id: true,
  number: true,
  total: true,
  shippingTotal: true,
  email: true,
  paymentStatus: true,
  canceledAt: true,
  shippingAddressJson: true,
  shippingMethodJson: true,
  customer: { select: { name: true, document: true } },
  items: { select: { productName: true, variantName: true, sku: true, unitPrice: true, quantity: true } },
} satisfies Prisma.OrderSelect

type PayableOrder = Prisma.OrderGetPayload<{ select: typeof PAYABLE_ORDER_SELECT }>

/** Posse (anti-IDOR) + loja + "ainda há o que cobrar". */
const loadPayableOrder = async (customerId: string, orderId: string): Promise<PayableOrder> => {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId, storeId: getActiveStoreId() },
    select: PAYABLE_ORDER_SELECT,
  })
  if (!order) throw notFound('Pedido')
  if (order.canceledAt) throw conflict('Este pedido foi cancelado.', ERROR_CODES.ORDER_NOT_PAYABLE)
  if (order.paymentStatus !== 'PENDING') {
    throw conflict('Este pedido já foi pago.', ERROR_CODES.ORDER_NOT_PAYABLE)
  }
  return order
}

const PIX_SELECT = { id: true, mpOrderId: true, expiresAt: true, metadataJson: true } satisfies Prisma.PaymentSelect

const findActivePix = (orderId: string) =>
  prisma.payment.findFirst({
    where: {
      orderId,
      storeId: getActiveStoreId(),
      provider: 'MERCADO_PAGO',
      method: 'PIX',
      status: 'PROCESSING',
      expiresAt: { gt: new Date(Date.now() + PIX_REUSE_MARGIN_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: PIX_SELECT,
  })

type PixMetadata = { qrCode: string; qrCodeBase64: string; ticketUrl: string | null }

const toPixCharge = (p: { expiresAt: Date | null; metadataJson: Prisma.JsonValue }): PixCharge | null => {
  const meta = p.metadataJson as Partial<PixMetadata> | null
  if (!meta?.qrCode || !meta.qrCodeBase64 || !p.expiresAt) return null
  return {
    qrCode: meta.qrCode,
    qrCodeBase64: meta.qrCodeBase64,
    ticketUrl: meta.ticketUrl ?? null,
    expiresAt: p.expiresAt.toISOString(),
  }
}

/** Sem efeito colateral e sem chamada ao MP: abrir a tela não cria cobrança. */
const getMercadoPagoCheckout = async (
  customerId: string,
  orderId: string,
): Promise<MercadoPagoOrderPayment> => {
  const order = await loadPayableOrder(customerId, orderId)
  const publicKey = getMpPublicKey()

  const [pix, pendingCard] = await Promise.all([
    findActivePix(order.id),
    prisma.payment.findFirst({
      where: {
        orderId: order.id,
        storeId: getActiveStoreId(),
        provider: 'MERCADO_PAGO',
        method: 'CARD',
        status: 'PROCESSING',
      },
      select: { id: true },
    }),
  ])

  return {
    provider: 'MERCADO_PAGO',
    publicKey,
    amount: order.total,
    payerEmail: payerEmail(order),
    pix: pix ? toPixCharge(pix) : null,
    cardPending: !!pendingCard,
  }
}

// ── Mercado Pago: montar a cobrança ──────────────────────────────────────────

/** Em modo teste o MP pode recusar pagador que seja conta real dele; ver MP_TEST_PAYER_EMAIL. */
const payerEmail = (order: Pick<PayableOrder, 'email'>): string =>
  mercadoPagoConfig.testPayerEmail ?? order.email

const documentToIdentification = (document: string | null): MpPayer['identification'] => {
  const digits = document?.replace(/\D/g, '') ?? ''
  if (digits.length === 11) return { type: 'CPF', number: digits }
  if (digits.length === 14) return { type: 'CNPJ', number: digits }
  return undefined
}

/**
 * Pagador completo: o antifraude do MP aprova mais quando o objeto `payer` vem
 * cheio. Nome em `first_name` (primeira palavra) e o resto em `last_name`.
 */
const buildPayer = (order: PayableOrder, identification?: MpPayer['identification']): MpPayer => {
  const [firstName, ...rest] = order.customer.name.trim().split(/\s+/)
  const address = orderAddressSchema.safeParse(order.shippingAddressJson)
  const doc = identification ?? documentToIdentification(order.customer.document)
  return {
    email: payerEmail(order),
    ...(firstName ? { firstName } : {}),
    ...(rest.length ? { lastName: rest.join(' ') } : {}),
    ...(doc ? { identification: doc } : {}),
    ...(address.success
      ? {
          address: {
            zipCode: address.data.zipCode.replace(/\D/g, ''),
            streetName: address.data.street,
            streetNumber: address.data.number,
            neighborhood: address.data.district,
            city: address.data.city,
            state: address.data.state,
            ...(address.data.complement ? { complement: address.data.complement } : {}),
          },
        }
      : {}),
  }
}

/** Do catálogo do MP (GET /item_categories): vela e aromatizador são "home". */
const PRODUCT_CATEGORY = 'home'
const SHIPPING_CATEGORY = 'services'

/**
 * Itens do pedido + frete como item. O MP exige que a soma bata com o total e não
 * aceita item negativo: com desconto, a cobrança vai sem itens (são ponto de
 * qualidade do antifraude, não requisito).
 */
const buildItems = (order: PayableOrder): MpItem[] | undefined => {
  const items: MpItem[] = order.items.map((i) => ({
    title: i.variantName ? `${i.productName} (${i.variantName})` : i.productName,
    description: i.productName,
    quantity: i.quantity,
    unitPriceCents: i.unitPrice,
    externalCode: i.sku,
    categoryId: PRODUCT_CATEGORY,
  }))
  if (order.shippingTotal > 0) {
    const method = orderShippingMethodSchema.safeParse(order.shippingMethodJson)
    items.push({
      title: method.success ? `Frete ${method.data.carrier} ${method.data.service}` : 'Frete',
      description: 'Frete',
      quantity: 1,
      unitPriceCents: order.shippingTotal,
      categoryId: SHIPPING_CATEGORY,
    })
  }
  const sum = items.reduce((acc, i) => acc + i.unitPriceCents * i.quantity, 0)
  return sum === order.total ? items : undefined
}

const description = (order: Pick<PayableOrder, 'number'>): string => `Pedido #${order.number} · Arte no Jardim`

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'

/**
 * Grava a tentativa ANTES de aplicar o estado. O unique em `mpOrderId` absorve a
 * corrida de duas chamadas com a mesma chave de idempotência (o MP devolve a
 * mesma order às duas).
 */
const recordAttempt = async (
  order: PayableOrder,
  snapshot: MpOrderSnapshot,
  method: PaymentMethod,
): Promise<void> => {
  const pix = snapshot.payment?.pix
  try {
    await prisma.payment.create({
      data: {
        storeId: getActiveStoreId(),
        orderId: order.id,
        provider: 'MERCADO_PAGO',
        mpOrderId: snapshot.id,
        mpPaymentId: snapshot.payment?.id ?? null,
        method,
        amount: order.total,
        status: 'PROCESSING',
        statusDetail: snapshot.payment?.statusDetail ?? snapshot.statusDetail,
        expiresAt: snapshot.payment?.expiresAt ?? null,
        metadataJson: pix
          ? { qrCode: pix.qrCode, qrCodeBase64: pix.qrCodeBase64, ticketUrl: pix.ticketUrl }
          : method === 'CARD'
            ? { brand: snapshot.payment?.methodId ?? null, installments: snapshot.payment?.installments ?? null }
            : Prisma.JsonNull,
      },
    })
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
  }
}

// ── Mercado Pago: Pix ────────────────────────────────────────────────────────

/**
 * Gera o Pix do pedido — ou devolve o que já está em aberto e longe de vencer:
 * recarregar a tela não pode gerar um QR novo a cada vez.
 */
export const createPixPayment = async (customerId: string, orderId: string): Promise<PixCharge> => {
  assertMercadoPagoActive()
  const order = await loadPayableOrder(customerId, orderId)

  const active = await findActivePix(order.id)
  const reused = active && toPixCharge(active)
  if (reused) return reused

  // Uma chave por "vaga" de tentativa: o clique duplo cai na mesma vaga, e o MP
  // devolve a mesma order às duas chamadas.
  const attempt = await prisma.payment.count({
    where: { orderId: order.id, storeId: getActiveStoreId(), provider: 'MERCADO_PAGO' },
  })
  const ttl = Math.max(PIX_MIN_MINUTES, (await getSetting('reservation_ttl_minutes')).PIX)

  const items = buildItems(order)
  const snapshot = await createPixOrder({
    externalReference: order.id,
    amountCents: order.total,
    description: description(order),
    payer: buildPayer(order),
    ...(items ? { items } : {}),
    idempotencyKey: `pix-${order.id}-${attempt}`,
    expiresInMinutes: ttl,
  })

  await recordAttempt(order, snapshot, 'PIX')
  await applyMercadoPagoOrder(snapshot)

  const expiresAt = snapshot.payment?.expiresAt ?? new Date(Date.now() + ttl * 60_000)
  await extendOrderReservations(order.id, new Date(expiresAt.getTime() + 5 * 60_000))

  const pix = snapshot.payment?.pix
  if (!pix) {
    logger.error({ mpOrderId: snapshot.id, status: snapshot.status }, 'Mercado Pago: order Pix sem QR')
    throw appError(ERROR_CODES.EXTERNAL_SERVICE_ERROR, 'Não foi possível gerar o Pix agora. Tente novamente.', 503)
  }
  return { ...pix, expiresAt: expiresAt.toISOString() }
}

// ── Mercado Pago: cartão ─────────────────────────────────────────────────────

const declined = (reason: string): never => {
  throw appError(ERROR_CODES.PAYMENT_DECLINED, 'Pagamento não aprovado.', 402, [
    { field: 'reason', message: reason },
  ])
}

/**
 * Cobra o cartão com o token do Brick. Valor e e-mail vêm do pedido no banco —
 * o Brick também os manda, e são ignorados de propósito.
 *
 * O resultado volta na hora (servidor-a-servidor) e é aplicado pela mesma função
 * do webhook: aprovado já vira PAID aqui; o webhook depois só confirma.
 */
export const createCardPayment = async (
  customerId: string,
  orderId: string,
  input: CreateCardPaymentInput,
): Promise<CardPaymentResult> => {
  assertMercadoPagoActive()
  const order = await loadPayableOrder(customerId, orderId)

  const inReview = await prisma.payment.findFirst({
    where: {
      orderId: order.id,
      storeId: getActiveStoreId(),
      provider: 'MERCADO_PAGO',
      method: 'CARD',
      status: 'PROCESSING',
    },
    select: { id: true },
  })
  if (inReview) {
    throw conflict(
      'Seu pagamento anterior está em análise. Aguarde a confirmação antes de tentar de novo.',
      ERROR_CODES.ORDER_NOT_PAYABLE,
    )
  }

  // Pix em aberto sai antes: sem isso o cliente pode pagar os dois.
  const pixPaid = await cancelOpenPix(order.id)
  if (pixPaid) throw conflict('Este pedido acabou de ser pago via Pix.', ERROR_CODES.ORDER_NOT_PAYABLE)

  const items = buildItems(order)
  const snapshot = await createCardOrder({
    externalReference: order.id,
    amountCents: order.total,
    description: description(order),
    payer: buildPayer(order, input.identification),
    ...(items ? { items } : {}),
    // O token é de uso único: o mesmo envio (clique duplo) dá a mesma chave e o
    // MP devolve a mesma order; um cartão novo gera token novo e tentativa nova.
    idempotencyKey: `card-${order.id}-${createHash('sha256').update(input.token).digest('hex').slice(0, 32)}`,
    token: input.token,
    paymentMethodId: input.paymentMethodId,
    paymentType: input.paymentType,
    installments: input.installments,
    deviceId: input.deviceId,
  })

  if (!snapshot) return declined('invalid_request')

  await recordAttempt(order, snapshot, 'CARD')
  const applied = await applyMercadoPagoOrder(snapshot)
  const status = applied?.paymentStatus

  logger.info(
    {
      orderId: order.id,
      mpOrderId: snapshot.id,
      status: snapshot.status,
      statusDetail: snapshot.payment?.statusDetail ?? snapshot.statusDetail,
      deviceId: !!input.deviceId,
    },
    'Mercado Pago: cartão processado',
  )

  if (status === 'PAID') return { status: 'PAID' }
  if (status === 'FAILED') return declined(snapshot.payment?.statusDetail ?? snapshot.statusDetail ?? 'failed')
  return { status: 'PROCESSING' }
}

// ── Mercado Pago: cancelar o que está em aberto ──────────────────────────────

/** Cancela no MP e aplica o estado real. Devolve true se, na verdade, já estava pago. */
const cancelAttempt = async (mpOrderId: string): Promise<boolean> => {
  const snapshot = await cancelMpOrder(mpOrderId, `cancel-${mpOrderId}`)
  const applied = await applyMercadoPagoOrder(snapshot)
  return applied?.paymentStatus === 'PAID'
}

const cancelOpenPix = async (orderId: string): Promise<boolean> => {
  const open = await prisma.payment.findMany({
    where: {
      orderId,
      storeId: getActiveStoreId(),
      provider: 'MERCADO_PAGO',
      method: 'PIX',
      status: 'PROCESSING',
      mpOrderId: { not: null },
    },
    select: { mpOrderId: true },
  })
  let paid = false
  for (const p of open) paid = (await cancelAttempt(p.mpOrderId!)) || paid
  return paid
}

/**
 * Pedido não pago cancelado (pelo cliente ou pelo staff): o Pix em aberto no MP
 * tem de morrer junto, senão continua pagável. Melhor esforço — o cancelamento do
 * pedido já foi gravado; uma falha aqui só loga, e o Pix vence sozinho. Se ele
 * tiver sido pago no meio-tempo, `applyMercadoPagoOrder` registra o dinheiro e
 * avisa o staff para reembolsar.
 */
export const cancelPendingMercadoPagoPayments = async (orderId: string): Promise<void> => {
  try {
    const open = await prisma.payment.findMany({
      where: {
        orderId,
        storeId: getActiveStoreId(),
        provider: 'MERCADO_PAGO',
        status: 'PROCESSING',
        mpOrderId: { not: null },
      },
      select: { mpOrderId: true },
    })
    for (const p of open) {
      try {
        await cancelAttempt(p.mpOrderId!)
      } catch (err) {
        logger.error({ err, orderId, mpOrderId: p.mpOrderId }, 'Mercado Pago: falha ao cancelar cobrança em aberto')
      }
    }
  } catch (err) {
    logger.error({ err, orderId }, 'Mercado Pago: falha ao listar cobranças em aberto do pedido cancelado')
  }
}

// ── Reembolso ────────────────────────────────────────────────────────────────

/**
 * Pede o reembolso ao MP e aplica o estado que ele devolve. Sem `amountCents` =
 * todo o saldo restante.
 */
const refundMercadoPagoPayment = async (
  payment: { mpOrderId: string; mpPaymentId: string | null },
  amountCents: number | undefined,
  idempotencyKey: string,
): Promise<void> => {
  const snapshot = await refundMpOrder(
    payment.mpOrderId,
    { paymentId: payment.mpPaymentId, ...(amountCents !== undefined ? { amountCents } : {}) },
    idempotencyKey,
  )
  await applyMercadoPagoOrder(snapshot)
}

const REFUNDABLE_PAYMENT_SELECT = {
  id: true,
  provider: true,
  method: true,
  amount: true,
  refundedAmount: true,
  mpOrderId: true,
  mpPaymentId: true,
  stripePaymentIntentId: true,
} satisfies Prisma.PaymentSelect

/** O pagamento que efetivamente pagou: um pedido pode ter tentativas falhas antes dele. */
const findPaidPayment = (orderId: string) =>
  prisma.payment.findFirst({
    where: { orderId, storeId: getActiveStoreId(), status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
    orderBy: { createdAt: 'desc' },
    select: REFUNDABLE_PAYMENT_SELECT,
  })

const actorUserId = (actor: RefundActor): string | null =>
  actor.kind === 'staff' ? (actor.userId ?? null) : null

/**
 * Pede o reembolso ao provedor e registra o PEDIDO na timeline. O status do
 * pagamento (REFUNDED/PARTIALLY_REFUNDED) e o `refundedAmount` vêm do provedor —
 * no MP, pela order que ele devolve já reembolsada; no Stripe, pelo webhook
 * `charge.refunded`. Gravar aqui por conta própria estaria errado na hora em que
 * o provedor recusasse: o pedido diria "reembolsado" com o dinheiro no caixa.
 *
 * A recusa do provedor vira `order.refund_failed` na timeline antes de subir: é
 * o que faz o staff ver o porquê, e o que renova a chave de idempotência da
 * próxima tentativa.
 */
export const refundOrderPayment = async (
  orderId: string,
  input: { amount?: number | undefined; reason: RefundOrderInput['reason'] },
  actor: RefundActor,
): Promise<{ amount: number; method: PaymentMethod | null }> => {
  const payment = await findPaidPayment(orderId)
  if (!payment) {
    throw businessError(ERROR_CODES.VALIDATION_ERROR, 'Este pedido não tem pagamento confirmado para reembolsar.', 422)
  }

  const refundable = refundableOf(payment)
  if (refundable <= 0) throw conflict('Este pagamento já foi totalmente reembolsado.')

  const amount = input.amount ?? refundable
  if (amount > refundable) {
    throw businessError(
      ERROR_CODES.VALIDATION_ERROR,
      `Valor acima do saldo reembolsável (${(refundable / 100).toFixed(2)}).`,
      422,
    )
  }

  const priorFailures = await prisma.orderEvent.count({ where: { orderId, type: EVENTS.order.refundFailed } })
  const idempotencyKey = refundIdempotencyKey(orderId, payment.refundedAmount, amount, priorFailures)

  let providerLabel: string
  let refundMeta: Record<string, unknown>
  try {
    if (payment.provider === 'MERCADO_PAGO') {
      if (!payment.mpOrderId) throw conflict('Pagamento sem order do Mercado Pago para reembolsar.')
      // Sem valor = "todo o saldo": o MP calcula o restante, sem arredondar do nosso lado.
      await refundMercadoPagoPayment(
        { mpOrderId: payment.mpOrderId, mpPaymentId: payment.mpPaymentId },
        amount === refundable ? undefined : amount,
        idempotencyKey,
      )
      providerLabel = 'Mercado Pago'
      refundMeta = { mpOrderId: payment.mpOrderId }
    } else {
      if (!payment.stripePaymentIntentId) throw conflict('Pagamento sem PaymentIntent do Stripe para reembolsar.')
      const refund = await createRefund({
        paymentIntentId: payment.stripePaymentIntentId,
        amountCents: amount,
        reason: input.reason,
        idempotencyKey,
      })
      providerLabel = 'Stripe'
      refundMeta = { refundId: refund.id, status: refund.status }
    }
  } catch (err) {
    const cause = (err as { cause?: unknown }).cause
    await prisma.orderEvent
      .create({
        data: {
          orderId,
          type: EVENTS.order.refundFailed,
          description: `Estorno de R$ ${(amount / 100).toFixed(2)} recusado — reembolsar pelo admin`,
          metadataJson: {
            amount,
            by: actor.kind,
            error: err instanceof Error ? err.message : String(err),
            ...(cause instanceof Error ? { cause: cause.message } : {}),
          },
          userId: actorUserId(actor),
        },
      })
      .catch((eventErr: unknown) => logger.error({ err: eventErr, orderId }, 'falha ao registrar estorno recusado'))
    throw err
  }

  await prisma.orderEvent.create({
    data: {
      orderId,
      type: EVENTS.order.refundRequested,
      description: `Reembolso de R$ ${(amount / 100).toFixed(2)} solicitado ao ${providerLabel}`,
      metadataJson: { ...refundMeta, amount, reason: input.reason, by: actor.kind, idempotencyKey },
      userId: actorUserId(actor),
    },
  })

  logger.info({ orderId, amount, provider: payment.provider, by: actor.kind, ...refundMeta }, 'reembolso solicitado')
  return { amount, method: payment.method }
}

/**
 * Estorno TOTAL de um pedido cancelado, sem ninguém clicando: o cliente cancelou
 * um pedido pago, a loja aprovou o pedido de cancelamento, ou o pagamento chegou
 * depois do cancelamento.
 *
 * Nunca lança. O cancelamento já está gravado e não volta atrás por causa do
 * provedor; a recusa (saldo insuficiente, dinheiro ainda não liberado) fica na
 * timeline como `refund_failed`, e o pedido cancelado com saldo reembolsável é
 * o que o staff resolve no botão Reembolsar.
 */
export const refundCanceledOrder = async (orderId: string, actor: RefundActor): Promise<AutoRefundOutcome> => {
  let payment: Awaited<ReturnType<typeof findPaidPayment>> = null
  try {
    payment = await findPaidPayment(orderId)
    if (!payment || refundableOf(payment) <= 0) return { status: 'none' }

    const result = await refundOrderPayment(orderId, { reason: 'requested_by_customer' }, actor)
    return { status: 'requested', amount: result.amount, method: result.method }
  } catch (err) {
    logger.error({ err, orderId, by: actor.kind }, 'estorno automático do pedido cancelado falhou')
    return {
      status: 'failed',
      amount: payment ? refundableOf(payment) : 0,
      method: payment?.method ?? null,
    }
  }
}

/**
 * O pagamento chegou com o pedido já cancelado (o webhook atrasou, ou o cliente
 * pagou o Pix depois de cancelar). Antes, isto virava um evento pedindo ao staff
 * que reembolsasse; agora o estorno sai sozinho, e o staff só é acordado se o
 * provedor recusar.
 */
const refundPaidAfterCancel = async (orderId: string): Promise<void> => {
  const outcome = await refundCanceledOrder(orderId, { kind: 'system' })
  if (outcome.status === 'requested') await notifyOrderRefunded(orderId, outcome)
  if (outcome.status === 'failed') await notifyRefundFailed(orderId, outcome)
}

// ── Mercado Pago: a função única de estado ───────────────────────────────────

const PAYMENT_STATE_SELECT = {
  id: true,
  storeId: true,
  orderId: true,
  status: true,
  method: true,
  amount: true,
  refundedAmount: true,
  statusDetail: true,
} satisfies Prisma.PaymentSelect

type PaymentState = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_STATE_SELECT }>

export type ApplyResult = {
  orderId: string
  paymentStatus: PaymentStatus
}

/**
 * Order que não conhecemos pelo id, mas cujo `external_reference` é um pedido
 * nosso: a resposta da criação se perdeu (timeout depois de o MP criar). Adota a
 * order como tentativa. Order de outra origem (testes no painel) → null.
 */
const adoptOrphan = async (
  tx: Prisma.TransactionClient,
  storeId: string,
  snapshot: MpOrderSnapshot,
): Promise<PaymentState | null> => {
  if (!snapshot.externalReference) return null
  const order = await tx.order.findFirst({
    where: { id: snapshot.externalReference, storeId },
    select: { id: true, total: true },
  })
  if (!order) return null

  logger.warn({ mpOrderId: snapshot.id, orderId: order.id }, 'Mercado Pago: order sem tentativa gravada — adotada')
  return tx.payment.create({
    data: {
      storeId,
      orderId: order.id,
      provider: 'MERCADO_PAGO',
      mpOrderId: snapshot.id,
      mpPaymentId: snapshot.payment?.id ?? null,
      method: mpPaymentMethod(snapshot.payment),
      amount: order.total,
      status: 'PROCESSING',
      expiresAt: snapshot.payment?.expiresAt ?? null,
    },
    select: PAYMENT_STATE_SELECT,
  })
}

/**
 * A ÚNICA função que escreve status de pagamento do Mercado Pago. Chamada com a
 * order que o próprio MP devolveu ao servidor — resposta da criação, do
 * cancelamento, do reembolso, ou relida no webhook. Idempotente: reaplicar o
 * mesmo estado não muda nada, e as escritas são guardadas pelo status atual
 * (`updateMany where status`), então duas aplicações concorrentes não duplicam
 * efeito.
 */
export const applyMercadoPagoOrder = async (snapshot: MpOrderSnapshot): Promise<ApplyResult | null> => {
  const storeId = getActiveStoreId()
  const detail = snapshot.payment?.statusDetail ?? snapshot.statusDetail
  let paidOrderId: string | null = null
  let refundAfterCancelOrderId: string | null = null

  const result = await prisma.$transaction(async (tx): Promise<ApplyResult | null> => {
    const payment =
      (await tx.payment.findFirst({ where: { mpOrderId: snapshot.id, storeId }, select: PAYMENT_STATE_SELECT })) ??
      (await adoptOrphan(tx, storeId, snapshot))
    if (!payment) {
      logger.info({ mpOrderId: snapshot.id }, 'Mercado Pago: order sem pedido nosso — ignorada')
      return null
    }

    const decision = decideMercadoPagoTransition(payment, snapshot)
    // Guarda de concorrência: só escreve se ninguém mudou o status desde a leitura.
    const guarded = { id: payment.id, status: payment.status }
    const mpPaymentId = snapshot.payment?.id ? { mpPaymentId: snapshot.payment.id } : {}

    switch (decision.kind) {
      case 'progress': {
        if (detail !== payment.statusDetail) {
          await tx.payment.updateMany({ where: guarded, data: { statusDetail: detail, ...mpPaymentId } })
        }
        return { orderId: payment.orderId, paymentStatus: payment.status }
      }

      case 'paid': {
        const claimed = await tx.payment.updateMany({
          where: guarded,
          data: {
            status: 'PAID',
            paidAt: new Date(),
            method: decision.method ?? payment.method,
            statusDetail: detail,
            ...mpPaymentId,
          },
        })
        if (claimed.count === 0) return currentState(tx, payment.id)

        const orderClaimed = await tx.order.updateMany({
          where: { id: payment.orderId, paymentStatus: 'PENDING' },
          data: { paymentStatus: 'PAID' },
        })

        // Lido DEPOIS do claim, e não antes: o claim trava a linha do pedido, e só
        // assim um cancelamento que acabou de ser gravado aparece aqui. Lido antes,
        // o pedido cancelado no meio-tempo caía no ramo normal — "pedido
        // confirmado" para o cliente e nenhum estorno.
        const order = await tx.order.findUnique({
          where: { id: payment.orderId },
          select: { id: true, storeId: true, canceledAt: true },
        })
        if (!order) return { orderId: payment.orderId, paymentStatus: 'PAID' }

        if (orderClaimed.count === 0) {
          // Outra tentativa já pagou este pedido: dinheiro em dobro.
          logger.error({ orderId: order.id, mpOrderId: snapshot.id }, 'Mercado Pago: pagamento em duplicidade')
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: EVENTS.order.noteAdded,
              description: 'Pagamento em duplicidade recebido no Mercado Pago — reembolsar esta tentativa.',
              metadataJson: { mpOrderId: snapshot.id, amount: payment.amount },
            },
          })
        } else if (order.canceledAt) {
          // Pago depois do cancelamento: o dinheiro entrou, mas o estoque já foi
          // liberado e não há o que confirmar ao cliente. O estorno sai depois
          // do commit — é chamada externa, e o pagamento precisa estar gravado
          // como PAID para o reembolso achá-lo.
          logger.warn({ orderId: order.id, mpOrderId: snapshot.id }, 'Mercado Pago: pagamento em pedido cancelado')
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: EVENTS.order.paid,
              description: 'Pagamento recebido com o pedido já cancelado — estorno automático solicitado.',
              metadataJson: { afterCancel: true, mpOrderId: snapshot.id },
            },
          })
          refundAfterCancelOrderId = order.id
        } else {
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              type: EVENTS.order.paid,
              description: 'Pagamento confirmado',
              metadataJson: { provider: 'MERCADO_PAGO', method: decision.method, mpOrderId: snapshot.id },
            },
          })
          // A reserva vira venda: SALE no ledger + libera a reserva.
          await settleOrderReservations(tx, order.storeId, order.id)
          paidOrderId = order.id
        }
        return { orderId: order.id, paymentStatus: 'PAID' }
      }

      case 'failed': {
        const claimed = await tx.payment.updateMany({
          where: guarded,
          data: { status: 'FAILED', statusDetail: detail, ...mpPaymentId },
        })
        // Só a recusa de cartão é "pagamento não aprovado" para o cliente; Pix
        // vencido ou cancelado por troca de meio não é recusa de ninguém.
        if (claimed.count === 1 && payment.method === 'CARD') {
          await tx.orderEvent.create({
            data: {
              orderId: payment.orderId,
              type: EVENTS.order.paymentFailed,
              description: 'Pagamento não aprovado',
              metadataJson: { mpOrderId: snapshot.id, reason: detail },
            },
          })
        }
        return { orderId: payment.orderId, paymentStatus: claimed.count === 1 ? 'FAILED' : payment.status }
      }

      case 'refund': {
        const claimed = await tx.payment.updateMany({
          where: guarded,
          data: {
            status: decision.status,
            refundedAmount: decision.refundedAmount,
            refundedAt: new Date(),
            statusDetail: detail,
          },
        })
        if (claimed.count === 0) return currentState(tx, payment.id)

        // Estorno da cópia de um pagamento em duplicidade: o original segue
        // capturado, então o pedido continua pago — só fica o registro.
        const others = await tx.payment.findMany({
          where: { orderId: payment.orderId, id: { not: payment.id } },
          select: { status: true },
        })
        if (!refundMovesOrder(others.map((p) => p.status))) {
          await tx.orderEvent.create({
            data: {
              orderId: payment.orderId,
              type: EVENTS.order.noteAdded,
              description: 'Estorno do pagamento em duplicidade confirmado — o pedido segue pago.',
              metadataJson: { mpOrderId: snapshot.id, amountRefunded: decision.refundedAmount },
            },
          })
          return { orderId: payment.orderId, paymentStatus: decision.status }
        }

        // Como no Stripe: só sai de PAID/PARTIALLY_REFUNDED — um pedido que nunca
        // chegou a pago não retrocede para "reembolsado".
        const order = await tx.order.updateMany({
          where: { id: payment.orderId, paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
          data: { paymentStatus: decision.status },
        })
        if (order.count === 1) {
          await tx.orderEvent.create({
            data: {
              orderId: payment.orderId,
              type: EVENTS.order.refunded,
              description:
                decision.status === 'REFUNDED' ? 'Reembolso total confirmado' : 'Reembolso parcial confirmado',
              metadataJson: {
                mpOrderId: snapshot.id,
                amountRefunded: decision.refundedAmount,
                amountTotal: payment.amount,
              },
            },
          })
        }
        return { orderId: payment.orderId, paymentStatus: decision.status }
      }

      case 'none': {
        if (decision.reason === 'amount_mismatch') {
          logger.error(
            { mpOrderId: snapshot.id, paid: snapshot.paidCents, expected: payment.amount },
            'Mercado Pago: valor pago menor que o do pedido — NÃO marcado como pago',
          )
        } else if (decision.reason === 'chargeback' || decision.reason === 'refund_before_paid') {
          logger.warn({ mpOrderId: snapshot.id, status: snapshot.status, reason: decision.reason }, 'Mercado Pago: estado sem transição automática')
        }
        return { orderId: payment.orderId, paymentStatus: payment.status }
      }
    }
  })

  if (paidOrderId) {
    // Depois do commit e sem lançar: o pagamento já está gravado; uma fila fora do
    // ar não pode desfazê-lo nem fazer o MP reentregar.
    try {
      await publish(EVENTS.order.paid, { orderId: paidOrderId })
    } catch (err) {
      logger.error({ err, orderId: paidOrderId }, 'falha ao publicar order.paid — e-mail de confirmação não sairá')
    }
  }

  // Nunca lança: o webhook reentregue cairia em "sem mudança" e não tentaria de
  // novo — a falha vira evento na timeline e e-mail para a equipe.
  if (refundAfterCancelOrderId) await refundPaidAfterCancel(refundAfterCancelOrderId)

  return result
}

const currentState = async (tx: Prisma.TransactionClient, paymentId: string): Promise<ApplyResult | null> => {
  const p = await tx.payment.findUnique({ where: { id: paymentId }, select: { orderId: true, status: true } })
  return p ? { orderId: p.orderId, paymentStatus: p.status } : null
}

/** Intervalo mínimo entre duas releituras da mesma tentativa por polling. */
const REFRESH_INTERVAL_MS = 10_000

/**
 * Contingência do webhook: a tela de pagamento faz polling do status, e enquanto
 * houver tentativa em aberto no MP relemos a order lá e aplicamos — pela mesma
 * função única. Sem isto, uma notificação perdida ou recusada só seria reenviada
 * pelo MP 15 minutos depois, com o cliente olhando a tela do Pix.
 *
 * A vez é reivindicada no banco (`updatedAt` mais velho que o intervalo): várias
 * abas e várias instâncias do PM2 fazem, juntas, no máximo uma chamada ao MP a
 * cada 10 s por tentativa. Nunca lança — o status responde o que o banco tem.
 *
 * `force` pula a vez: o cancelamento do cliente precisa do estado REAL antes de
 * decidir entre cancelar um pedido não pago e estornar um pago, e o polling da
 * tela pode ter acabado de gastar a janela. O cancelamento já tem limite próprio.
 */
export const refreshPendingMercadoPagoPayment = async (
  orderId: string,
  opts: { force?: boolean } = {},
): Promise<void> => {
  try {
    const storeId = getActiveStoreId()
    const pending = await prisma.payment.findFirst({
      where: { orderId, storeId, provider: 'MERCADO_PAGO', status: 'PROCESSING', mpOrderId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, mpOrderId: true },
    })
    if (!pending?.mpOrderId) return

    if (!opts.force) {
      const now = new Date()
      const claimed = await prisma.payment.updateMany({
        where: { id: pending.id, status: 'PROCESSING', updatedAt: { lt: new Date(now.getTime() - REFRESH_INTERVAL_MS) } },
        data: { updatedAt: now },
      })
      if (claimed.count === 0) return
    }

    await syncMercadoPagoOrder(pending.mpOrderId)
  } catch (err) {
    logger.warn({ err, orderId }, 'Mercado Pago: releitura por polling falhou')
  }
}

/** Webhook: relê a order no MP (a notificação só diz "olhe de novo") e aplica. */
export const syncMercadoPagoOrder = async (mpOrderId: string): Promise<ApplyResult | null> => {
  const snapshot = await getMpOrder(mpOrderId)
  if (!snapshot) {
    logger.warn({ mpOrderId }, 'Mercado Pago: notificação de order que o MP não reconhece')
    return null
  }
  return applyMercadoPagoOrder(snapshot)
}
