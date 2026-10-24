import {
  ERROR_CODES,
  type CheckoutSummaryRequest,
  type CheckoutSummary,
  type ConfirmCheckoutInput,
  type Order,
  type ShippingOption,
  type Address,
  type CartItem,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { getSetting } from '../../shared/settings.js'
import { appError, businessError } from '../../shared/errors.js'
import { resolveCart, getCart } from '../cart/service.js'
import { getAddress } from '../addresses/service.js'
import { quoteShipping } from '../shipping/service.js'
import { getOrder } from '../orders/service.js'
import { notifyOrderCreated, type StockChange } from '../notifications/service.js'
import { afterStockChange } from '../inventory/service.js'
import { productionDaysOf } from '../inventory/domain/availability.js'
import { resolveCoupon, claimCouponUse, type CheckoutCoupon } from '../coupons/service.js'
import { computeCouponDiscount } from '../coupons/domain/rules.js'
import { calculateTotals, type Totals } from './domain/totals.js'

/**
 * Checkout — orquestra o fluxo e recalcula TUDO do banco, sempre. O request traz,
 * no máximo, ids e escolhas (endereço, serviço de frete); nunca valores. Preço vem
 * da variante, frete de uma recotação, total do domain/totals. Um preço adulterado
 * no DevTools é simplesmente ignorado.
 *
 * O carrinho NÃO é promovido: o checkout LÊ o carrinho e CONSTRÓI um pedido novo,
 * com tudo em snapshot (nome, preço, endereço, frete). O pedido é histórico.
 */

type Prepared = {
  cartId: string
  address: Address
  items: CartItem[]
  shipping: ShippingOption
  totals: Totals
  /** null também quando o cupom não mudaria nada (frete grátis num frete já zerado). */
  coupon: CheckoutCoupon | null
  customer: { email: string; phone: string | null }
}

/** Passo comum a summary e confirm: valida e recalcula, sem criar nada. */
const prepare = async (customerId: string, req: CheckoutSummaryRequest): Promise<Prepared> => {
  const { cartId } = await resolveCart({ customerId })
  const cart = await getCart(cartId)

  if (cart.items.length === 0) {
    throw appError(ERROR_CODES.CART_EMPTY, 'Seu carrinho está vazio.', 400)
  }
  // Um item que ficou indisponível (esgotou, foi despublicado) barra o checkout:
  // melhor forçar o cliente a ajustar o carrinho do que montar um pedido inválido.
  if (cart.items.some((i) => !i.purchasable)) {
    throw businessError(
      ERROR_CODES.INSUFFICIENT_STOCK,
      'Alguns itens ficaram indisponíveis. Revise o carrinho.',
      409,
    )
  }
  const items = cart.items

  const address = await getAddress(customerId, req.addressId)

  // Recota o frete AGORA (a cotação de minutos atrás não vale) e casa a escolha
  // pelo id do serviço. Some da lista = precisa recalcular.
  const options = await quoteShipping({
    zipCode: address.zipCode,
    items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
  })
  const shipping = options.find((o) => o.id === req.shippingServiceId)
  if (!shipping) {
    throw businessError(
      ERROR_CODES.SHIPPING_QUOTE_EXPIRED,
      'A opção de frete escolhida não está mais disponível. Recalcule o frete.',
      409,
    )
  }

  const totalsItems = items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity }))
  let totals = calculateTotals({ items: totalsItems, shippingCents: shipping.priceCents })

  // O cupom é revalidado AGORA (pode ter expirado ou esgotado desde a prévia) e
  // o desconto sai do banco, nunca do que a loja mostrou.
  let coupon: CheckoutCoupon | null = null
  if (req.couponCode) {
    const found = await resolveCoupon(customerId, req.couponCode, totals.subtotal)
    const discount = computeCouponDiscount(found, {
      subtotal: totals.subtotal,
      shipping: totals.shippingTotal,
    })
    // Desconto zero (frete grátis num frete que já é grátis) não gasta um uso.
    if (discount.products + discount.shipping > 0) {
      coupon = found
      totals = calculateTotals({
        items: totalsItems,
        shippingCents: shipping.priceCents,
        discountCents: discount.products,
        shippingDiscountCents: discount.shipping,
      })
      if (totals.total === 0) {
        throw businessError(
          ERROR_CODES.COUPON_NOT_APPLICABLE,
          'Este cupom zera o pedido e não pode ser usado nesta compra.',
          422,
        )
      }
    }
  }

  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { email: true, phone: true },
  })

  return { cartId, address, items, shipping, totals, coupon, customer }
}

const addressSnapshot = (a: Address): Order['shippingAddress'] => ({
  recipient: a.recipient,
  zipCode: a.zipCode,
  street: a.street,
  number: a.number,
  complement: a.complement,
  district: a.district,
  city: a.city,
  state: a.state,
})

const methodSnapshot = (s: ShippingOption): Order['shippingMethod'] => ({
  carrier: s.carrier,
  service: s.service,
  serviceId: s.id,
  priceCents: s.priceCents,
  deliveryDays: s.deliveryDays,
})

const isOrderNumberCollision = (err: unknown): boolean => {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false
  const target = err.meta?.['target']
  return Array.isArray(target) ? target.includes('number') : String(target).includes('number')
}

/** Prévia do pedido — não cria nada. Alimenta a tela de resumo. */
export const getSummary = async (
  customerId: string,
  req: CheckoutSummaryRequest,
): Promise<CheckoutSummary> => {
  const { address, items, shipping, totals } = await prepare(customerId, req)
  return {
    items: items.map((i) => ({
      productName: i.productName,
      variantName: i.variantLabel,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      totalPrice: i.lineTotal,
      imageUrl: i.imageUrl,
      madeToOrderQuantity: i.madeToOrderQuantity,
    })),
    shippingAddress: addressSnapshot(address),
    shippingMethod: methodSnapshot(shipping),
    productionDays: shipping.productionDays,
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    shippingTotal: totals.shippingTotal,
    total: totals.total,
  }
}

type ReservedLine = { variantId: string; ready: number; madeToOrder: number; productionDays: number | null }

/**
 * Reserva a parte PRONTA de uma linha, decidindo e escrevendo no mesmo comando
 * — o banco arbitra a concorrência, sem SELECT antes:
 *
 *  - STOCK_ONLY: tudo ou nada (`WHERE disponível >= qty`); nenhuma linha → 409.
 *  - MADE_TO_ORDER: não toca no estoque.
 *  - Híbrido: leva o que houver (`LEAST(qty, disponível)`) e o resto é produzido.
 *    O FOR UPDATE na CTE trava a linha entre a leitura do disponível e o UPDATE.
 *
 * Os `::int` não são enfeite: sem eles o parâmetro pode chegar como int8 e o
 * `take` voltar como BigInt.
 */
const reserveLine = async (
  tx: Prisma.TransactionClient,
  item: CartItem,
  productionDays: number | null,
  stock: StockChange[],
): Promise<ReservedLine> => {
  const line = (ready: number): ReservedLine => ({
    variantId: item.variantId,
    ready,
    madeToOrder: item.quantity - ready,
    productionDays,
  })

  if (item.stockPolicy === 'MADE_TO_ORDER') return line(0)

  if (item.stockPolicy === 'STOCK_ONLY') {
    const [level] = await tx.$queryRaw<{ onHand: number; reserved: number }[]>`
      UPDATE "InventoryLevel"
         SET reserved = reserved + ${item.quantity}
       WHERE "variantId" = ${item.variantId}
         AND ("onHand" - reserved) >= ${item.quantity}
      RETURNING "onHand", reserved
    `
    if (!level) {
      throw businessError(ERROR_CODES.INSUFFICIENT_STOCK, `Estoque insuficiente para ${item.productName}.`, 409)
    }
    stock.push({
      variantId: item.variantId,
      before: level.onHand - level.reserved + item.quantity,
      onHand: level.onHand,
      reserved: level.reserved,
    })
    return line(item.quantity)
  }

  const [taken] = await tx.$queryRaw<{ onHand: number; reserved: number; take: number }[]>`
    WITH cur AS (
      SELECT "variantId", LEAST(${item.quantity}::int, GREATEST("onHand" - reserved, 0))::int AS take
        FROM "InventoryLevel"
       WHERE "variantId" = ${item.variantId}
         FOR UPDATE
    )
    UPDATE "InventoryLevel" AS l
       SET reserved = l.reserved + cur.take
      FROM cur
     WHERE l."variantId" = cur."variantId"
       AND cur.take > 0
    RETURNING l."onHand", l.reserved, cur.take
  `
  if (!taken) return line(0)

  stock.push({
    variantId: item.variantId,
    before: taken.onHand - taken.reserved + taken.take,
    onHand: taken.onHand,
    reserved: taken.reserved,
  })
  return line(taken.take)
}

/**
 * Confirma: numa transação, RESERVA o estoque da parte pronta e cria o pedido
 * (PENDING) + itens (snapshot) com o que a reserva decidiu. Reserva NÃO é
 * movimento: a mercadoria continua na prateleira até o pagamento (Fase 1.12), e
 * a parte sob encomenda nem chega a reservar.
 *
 * A reserva vem ANTES do pedido porque é ela que decide quanto de cada linha é
 * produzido — e isso vai para o snapshot e para o prazo do pedido. O prazo que
 * vale é o daqui, não o da cotação: se a pronta entrega acabou no meio do
 * caminho e o prazo cresceu, o cliente vê a data nova antes de pagar (409).
 */
export const confirm = async (customerId: string, input: ConfirmCheckoutInput): Promise<Order> => {
  const { cartId, address, items, shipping, totals, coupon, customer } = await prepare(
    customerId,
    input,
  )
  const storeId = getActiveStoreId()

  // Peso é snapshot no item; carrega das variantes (o carrinho não guarda peso).
  // O prazo de produção também: é o do produto AGORA, congelado no pedido.
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: items.map((i) => i.variantId) } },
    select: { id: true, weight: true, product: { select: { productionDays: true } } },
  })
  const variantById = new Map(variants.map((v) => [v.id, v]))

  // TTL da reserva: sem método de pagamento ainda (Fase 1.12), usa o do Pix como
  // janela padrão. Um job de expiração libera as vencidas (Fase 1.18).
  const ttlMinutes = (await getSetting('reservation_ttl_minutes')).PIX
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000)

  // Retry no número do pedido: dois confirms simultâneos podem calcular o mesmo
  // `number`; o @@unique([storeId, number]) barra o segundo, que tenta o próximo.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { orderId, stock } = await prisma.$transaction(async (tx) => {
        // Antes do create: a contagem por cliente dentro do claim não pode
        // enxergar o próprio pedido que está nascendo.
        if (coupon) await claimCouponUse(tx, coupon, customerId)

        // Em ordem de variantId: duas confirmações com as mesmas peças travam as
        // linhas de estoque na mesma ordem, e uma espera a outra em vez de deadlock.
        // O RETURNING devolve o saldo de DEPOIS, sob o lock da linha: é dele que
        // sai o "antes" exato para o alerta de estoque baixo, sem outro SELECT.
        const stock: StockChange[] = []
        const lines = new Map<string, ReservedLine>()
        for (const i of [...items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
          const productionDays = variantById.get(i.variantId)?.product.productionDays ?? null
          lines.set(i.variantId, await reserveLine(tx, i, productionDays, stock))
        }

        const productionDays = productionDaysOf([...lines.values()])
        if (input.expectedProductionDays !== undefined && productionDays > input.expectedProductionDays) {
          throw businessError(
            ERROR_CODES.PRODUCTION_TIME_CHANGED,
            'Um item acabou de esgotar a pronta entrega e passa a ser produzido sob encomenda. Confira o novo prazo antes de continuar.',
            409,
          )
        }

        const agg = await tx.order.aggregate({ where: { storeId }, _max: { number: true } })
        const number = (agg._max.number ?? 0) + 1

        const order = await tx.order.create({
          data: {
            storeId,
            number,
            customerId,
            email: customer.email,
            phone: customer.phone,
            subtotal: totals.subtotal,
            discountTotal: totals.discountTotal,
            shippingTotal: totals.shippingTotal,
            total: totals.total,
            couponId: coupon?.id ?? null,
            couponCodeSnapshot: coupon?.code ?? null,
            shippingAddressJson: addressSnapshot(address) as object,
            shippingMethodJson: methodSnapshot(shipping) as object,
            productionDays,
            // O relógio do pedido só com encomenda: sem reserva, é ele que vence.
            paymentDueAt: expiresAt,
            customerNote: input.customerNote ?? null,
            items: {
              create: items.map((i) => ({
                variantId: i.variantId,
                productName: i.productName,
                variantName: i.variantLabel,
                sku: i.sku,
                unitPrice: i.unitPrice,
                quantity: i.quantity,
                totalPrice: i.lineTotal,
                weight: variantById.get(i.variantId)?.weight ?? 0,
                imageUrl: i.imageUrl,
                madeToOrderQuantity: lines.get(i.variantId)?.madeToOrder ?? 0,
              })),
            },
            events: {
              create: { type: EVENTS.order.created, description: 'Pedido criado' },
            },
          },
          select: { id: true },
        })

        // A reserva já foi feita acima; aqui só o registro dela, com o pedido.
        // Só a parte pronta: é ela que vira SALE no pagamento.
        const reservations = [...lines.values()].filter((l) => l.ready > 0)
        if (reservations.length > 0) {
          await tx.inventoryReservation.createMany({
            data: reservations.map((l) => ({
              variantId: l.variantId,
              orderId: order.id,
              quantity: l.ready,
              expiresAt,
            })),
          })
        }

        // O carrinho não é promovido: esvazia depois de virar pedido.
        await tx.cartItem.deleteMany({ where: { cartId } })

        // Devolvido pela transação, e não acumulado fora dela: a tentativa que
        // colidiu no número desfez a reserva, e não pode avisar nada.
        return { orderId: order.id, stock }
      })

      await notifyOrderCreated(orderId)
      await afterStockChange(stock)
      return getOrder(customerId, orderId)
    } catch (err) {
      // Colisão no número: tenta de novo com o próximo. Outros erros sobem —
      // inclusive outro unique, que repetido quatro vezes daria a mensagem errada.
      if (isOrderNumberCollision(err)) continue
      throw err
    }
  }

  throw appError(ERROR_CODES.CONFLICT, 'Não foi possível gerar o número do pedido. Tente novamente.', 409)
}
