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

  const totals = calculateTotals({
    items: items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity })),
    shippingCents: shipping.priceCents,
  })

  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { email: true, phone: true },
  })

  return { cartId, address, items, shipping, totals, customer }
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
    })),
    shippingAddress: addressSnapshot(address),
    shippingMethod: methodSnapshot(shipping),
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    shippingTotal: totals.shippingTotal,
    total: totals.total,
  }
}

/**
 * Confirma: numa transação, cria o pedido (PENDING) + itens (snapshot) e RESERVA
 * o estoque atomicamente. A reserva usa `UPDATE ... WHERE (onHand - reserved) >=
 * qty`: o banco arbitra a concorrência (dois clientes, uma peça → um 201, um 409),
 * sem SELECT antes, sem race. Reserva NÃO é movimento: a mercadoria continua na
 * prateleira até o pagamento (Fase 1.12).
 */
export const confirm = async (customerId: string, input: ConfirmCheckoutInput): Promise<Order> => {
  const { cartId, address, items, shipping, totals, customer } = await prepare(customerId, input)
  const storeId = getActiveStoreId()

  // Peso é snapshot no item; carrega das variantes (o carrinho não guarda peso).
  const weights = await prisma.productVariant.findMany({
    where: { id: { in: items.map((i) => i.variantId) } },
    select: { id: true, weight: true },
  })
  const weightById = new Map(weights.map((w) => [w.id, w.weight]))

  // TTL da reserva: sem método de pagamento ainda (Fase 1.12), usa o do Pix como
  // janela padrão. Um job de expiração libera as vencidas (Fase 1.18).
  const ttlMinutes = (await getSetting('reservation_ttl_minutes')).PIX
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000)

  // Retry no número do pedido: dois confirms simultâneos podem calcular o mesmo
  // `number`; o @@unique([storeId, number]) barra o segundo, que tenta o próximo.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const orderId = await prisma.$transaction(async (tx) => {
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
            shippingAddressJson: addressSnapshot(address) as object,
            shippingMethodJson: methodSnapshot(shipping) as object,
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
                weight: weightById.get(i.variantId) ?? 0,
                imageUrl: i.imageUrl,
              })),
            },
            events: {
              create: { type: EVENTS.order.created, description: 'Pedido criado' },
            },
          },
          select: { id: true },
        })

        // Reserva atômica por item. Zero linhas = sem estoque → 409 e rollback.
        for (const i of items) {
          const affected = await tx.$executeRaw`
            UPDATE "InventoryLevel"
               SET reserved = reserved + ${i.quantity}
             WHERE "variantId" = ${i.variantId}
               AND ("onHand" - reserved) >= ${i.quantity}
          `
          if (affected === 0) {
            throw businessError(
              ERROR_CODES.INSUFFICIENT_STOCK,
              `Estoque insuficiente para ${i.productName}.`,
              409,
            )
          }
          await tx.inventoryReservation.create({
            data: { variantId: i.variantId, orderId: order.id, quantity: i.quantity, expiresAt },
          })
        }

        // O carrinho não é promovido: esvazia depois de virar pedido.
        await tx.cartItem.deleteMany({ where: { cartId } })

        return order.id
      })

      return getOrder(customerId, orderId)
    } catch (err) {
      // Colisão no número: tenta de novo com o próximo. Outros erros sobem.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue
      throw err
    }
  }

  throw appError(ERROR_CODES.CONFLICT, 'Não foi possível gerar o número do pedido. Tente novamente.', 409)
}
