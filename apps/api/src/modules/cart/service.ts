import {
  ERROR_CODES,
  type AddToCartInput,
  type Cart,
  type CartItem,
} from '@ecommerce/shared/contracts'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { appError, notFound, businessError } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { storage } from '../../integrations/storage/index.js'
import { generateOpaqueToken } from '../../utils/crypto.js'

/**
 * Carrinho. Regras da arquitetura §6:
 *  - preço é SEMPRE lido ao vivo da variante; o item não guarda preço.
 *  - o carrinho não vira pedido; o checkout lê e recalcula.
 *  - por cliente OU por sessão anônima; ao logar, mescla.
 *
 * Toda leitura devolve o carrinho RECALCULADO: preço atual, disponibilidade
 * atual, purchasable atual. É o que garante que o cliente nunca veja um total
 * que o checkout vai recusar.
 */

const CART_TTL_DAYS = 30
const cartExpiry = (): Date => new Date(Date.now() + CART_TTL_DAYS * 86400 * 1000)

/** Identidade de quem pede o carrinho: cliente logado ou sessão anônima. */
export type CartOwner = { customerId: string } | { sessionToken: string }

const ownerWhere = (owner: CartOwner): Prisma.CartWhereInput =>
  'customerId' in owner ? { customerId: owner.customerId } : { sessionToken: owner.sessionToken }

/**
 * Acha o carrinho do dono, ou cria um. Para anônimo sem token ainda, gera um
 * sessionToken novo (o controller o devolve num cookie).
 */
export const resolveCart = async (
  owner: CartOwner,
): Promise<{ cartId: string; sessionToken?: string }> => {
  const storeId = getActiveStoreId()

  const existing = await prisma.cart.findFirst({
    where: { storeId, ...ownerWhere(owner) },
    select: { id: true },
  })
  if (existing) return { cartId: existing.id }

  const created = await prisma.cart.create({
    data: {
      storeId,
      ...('customerId' in owner
        ? { customerId: owner.customerId }
        : { sessionToken: owner.sessionToken }),
      expiresAt: cartExpiry(),
    },
    select: { id: true },
  })
  return {
    cartId: created.id,
    ...('sessionToken' in owner ? { sessionToken: owner.sessionToken } : {}),
  }
}

const ITEM_SELECT = {
  id: true,
  quantity: true,
  variant: {
    select: {
      id: true,
      sku: true,
      price: true,
      isActive: true,
      imageId: true,
      product: { select: { id: true, name: true, slug: true, status: true, deletedAt: true } },
      optionValues: { select: { optionValue: { select: { value: true } } } },
      images: { orderBy: { position: 'asc' }, take: 1, select: { upload: { select: { key: true } } } },
      level: { select: { onHand: true, reserved: true } },
    },
  },
} satisfies Prisma.CartItemSelect

type ItemRow = Prisma.CartItemGetPayload<{ select: typeof ITEM_SELECT }>

const toCartItem = (row: ItemRow): CartItem => {
  const v = row.variant
  const available = Math.max(0, (v.level?.onHand ?? 0) - (v.level?.reserved ?? 0))
  // Comprável = variante ativa, produto publicado e não apagado, e há estoque.
  const purchasable =
    v.isActive && v.product.status === 'ACTIVE' && !v.product.deletedAt && available >= row.quantity

  const key = v.images[0]?.upload.key
  return {
    id: row.id,
    variantId: v.id,
    productId: v.product.id,
    productName: v.product.name,
    productSlug: v.product.slug,
    variantLabel: v.optionValues.map((o) => o.optionValue.value).join(' / ') || '—',
    sku: v.sku,
    imageUrl: key ? storage().getPublicUrl(key) : null,
    unitPrice: v.price, // AO VIVO
    quantity: row.quantity,
    lineTotal: v.price * row.quantity,
    available,
    purchasable,
  }
}

/** Carrinho recalculado: preço, disponibilidade e purchasable atuais. */
export const getCart = async (cartId: string): Promise<Cart> => {
  const rows = await prisma.cartItem.findMany({
    where: { cartId },
    orderBy: { createdAt: 'asc' },
    select: ITEM_SELECT,
  })

  const items = rows.map(toCartItem)
  // subtotal só dos compráveis: um item indisponível não entra no total que o
  // cliente vê como "a pagar".
  const subtotal = items.filter((i) => i.purchasable).reduce((sum, i) => sum + i.lineTotal, 0)
  const itemCount = items.filter((i) => i.purchasable).reduce((sum, i) => sum + i.quantity, 0)

  return { id: cartId, items, subtotal, itemCount }
}

const touch = (cartId: string): Promise<unknown> =>
  prisma.cart.update({ where: { id: cartId }, data: { expiresAt: cartExpiry() } })

/** Valida que a variante existe, é da loja, e está comprável antes de adicionar. */
const assertPurchasable = async (variantId: string, quantity: number): Promise<void> => {
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, storeId: getActiveStoreId() },
    select: {
      isActive: true,
      product: { select: { status: true, deletedAt: true } },
      level: { select: { onHand: true, reserved: true } },
    },
  })
  if (!variant) throw notFound('Produto')

  const active = variant.isActive && variant.product.status === 'ACTIVE' && !variant.product.deletedAt
  if (!active) throw businessError(ERROR_CODES.NOT_FOUND, 'Produto indisponível', 422)

  const available = Math.max(0, (variant.level?.onHand ?? 0) - (variant.level?.reserved ?? 0))
  if (available < quantity) {
    throw businessError(
      ERROR_CODES.INSUFFICIENT_STOCK,
      available === 0 ? 'Produto esgotado' : `Restam apenas ${available} em estoque`,
      422,
    )
  }
}

export const addItem = async (cartId: string, input: AddToCartInput): Promise<Cart> => {
  // Quantidade final = existente + nova; valida o total contra o estoque, não só
  // o incremento, senão dá para furar o limite clicando "adicionar" repetidas vezes.
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId, variantId: input.variantId } },
    select: { quantity: true },
  })
  const nextQty = (existing?.quantity ?? 0) + input.quantity

  await assertPurchasable(input.variantId, nextQty)

  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId: input.variantId } },
    create: { cartId, variantId: input.variantId, quantity: input.quantity },
    update: { quantity: nextQty },
  })
  await touch(cartId)
  return getCart(cartId)
}

export const updateItem = async (
  cartId: string,
  itemId: string,
  quantity: number,
): Promise<Cart> => {
  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId },
    select: { variantId: true },
  })
  if (!item) throw notFound('Item do carrinho')

  if (quantity === 0) {
    await prisma.cartItem.delete({ where: { id: itemId } })
  } else {
    await assertPurchasable(item.variantId, quantity)
    await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } })
  }
  await touch(cartId)
  return getCart(cartId)
}

export const removeItem = async (cartId: string, itemId: string): Promise<Cart> => {
  await prisma.cartItem.deleteMany({ where: { id: itemId, cartId } })
  await touch(cartId)
  return getCart(cartId)
}

/**
 * Mescla o carrinho anônimo no do cliente ao logar. Some as quantidades por
 * variante (o cliente pode ter itens em ambos), respeitando o teto de estoque no
 * próximo recálculo. Depois apaga o carrinho anônimo.
 *
 * Idempotente e seguro: se o anônimo não existir, não faz nada.
 */
export const mergeCarts = async (sessionToken: string, customerId: string): Promise<string> => {
  const storeId = getActiveStoreId()

  const anon = await prisma.cart.findFirst({
    where: { storeId, sessionToken },
    select: { id: true, items: { select: { variantId: true, quantity: true } } },
  })

  const { cartId: targetId } = await resolveCart({ customerId })

  if (!anon || anon.items.length === 0) {
    if (anon) await prisma.cart.delete({ where: { id: anon.id } })
    return targetId
  }

  await prisma.$transaction(async (tx) => {
    for (const item of anon.items) {
      const existing = await tx.cartItem.findUnique({
        where: { cartId_variantId: { cartId: targetId, variantId: item.variantId } },
        select: { quantity: true },
      })
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: targetId, variantId: item.variantId } },
        create: { cartId: targetId, variantId: item.variantId, quantity: item.quantity },
        update: { quantity: Math.min(99, (existing?.quantity ?? 0) + item.quantity) },
      })
    }
    await tx.cart.delete({ where: { id: anon.id } })
  })

  await touch(targetId)
  return targetId
}

export const generateSessionToken = (): string => generateOpaqueToken()
