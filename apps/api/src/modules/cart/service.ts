import {
  ERROR_CODES,
  pickVariantImage,
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
      // As imagens vêm do PRODUTO, não da relação `variant.images`. Aquela só
      // traz ProductImage com variantId = esta variante — quase sempre vazia,
      // e era por isso que toda linha de carrinho vinha sem foto.
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          deletedAt: true,
          images: {
            orderBy: { position: 'asc' },
            select: { variantId: true, position: true, upload: { select: { key: true } } },
          },
        },
      },
      optionValues: { select: { optionValue: { select: { value: true } } } },
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

  // Mesma ordem de resolução que a galeria da loja usa — foto da variação
  // primeiro, foto do produto depois. Sem `take: 1` no select porque essa
  // prioridade depende do id da própria variante, que o orderBy não alcança.
  const key = pickVariantImage(v.product.images, v.id)?.upload.key
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

type PurchasableCheck =
  | { ok: true; available: number }
  | { ok: false; reason: 'MISSING' | 'UNAVAILABLE' | 'OUT_OF_STOCK'; available: number }

/**
 * Responde se dá para comprar, sem decidir o que fazer a respeito.
 *
 * Existe separada de `assertPurchasable` porque "comprar de novo" precisa
 * SABER que um item ficou de fora para reportá-lo, e não abortar a operação
 * inteira — lançar é a política do fluxo normal de carrinho, não uma verdade
 * sobre o estoque.
 */
const checkPurchasable = async (
  variantId: string,
  quantity: number,
): Promise<PurchasableCheck> => {
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, storeId: getActiveStoreId() },
    select: {
      isActive: true,
      product: { select: { status: true, deletedAt: true } },
      level: { select: { onHand: true, reserved: true } },
    },
  })
  if (!variant) return { ok: false, reason: 'MISSING', available: 0 }

  const active = variant.isActive && variant.product.status === 'ACTIVE' && !variant.product.deletedAt
  if (!active) return { ok: false, reason: 'UNAVAILABLE', available: 0 }

  const available = Math.max(0, (variant.level?.onHand ?? 0) - (variant.level?.reserved ?? 0))
  if (available < quantity) return { ok: false, reason: 'OUT_OF_STOCK', available }

  return { ok: true, available }
}

/** Valida que a variante existe, é da loja, e está comprável antes de adicionar. */
const assertPurchasable = async (variantId: string, quantity: number): Promise<void> => {
  const check = await checkPurchasable(variantId, quantity)
  if (check.ok) return

  if (check.reason === 'MISSING') throw notFound('Produto')
  if (check.reason === 'UNAVAILABLE') {
    throw businessError(ERROR_CODES.NOT_FOUND, 'Produto indisponível', 422)
  }
  throw businessError(
    ERROR_CODES.INSUFFICIENT_STOCK,
    check.available === 0 ? 'Produto esgotado' : `Restam apenas ${check.available} em estoque`,
    422,
  )
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

export type BulkAddInput = { variantId: string; productName: string; quantity: number }

export type BulkAddResult = {
  added: { variantId: string; productName: string; quantity: number }[]
  skipped: {
    productName: string
    reason: 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'PARTIAL'
    requested: number
    added: number
  }[]
}

/**
 * Adiciona vários itens tolerando falha parcial. Usado por "comprar de novo".
 *
 * Onde há estoque para parte do pedido, leva a parte e reporta PARTIAL: quem
 * comprou 3 velas e só encontra 1 prefere levar a que existe. Um único
 * `getCart` no fim, porque recalcular o carrinho inteiro a cada item era o
 * custo que fazia a alternativa (N chamadas do cliente) ser ruim.
 */
export const addItems = async (cartId: string, inputs: BulkAddInput[]): Promise<BulkAddResult> => {
  const result: BulkAddResult = { added: [], skipped: [] }

  for (const input of inputs) {
    const existing = await prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId: input.variantId } },
      select: { quantity: true },
    })
    const alreadyInCart = existing?.quantity ?? 0
    const check = await checkPurchasable(input.variantId, alreadyInCart + input.quantity)

    if (!check.ok && (check.reason === 'MISSING' || check.reason === 'UNAVAILABLE')) {
      result.skipped.push({
        productName: input.productName,
        reason: 'UNAVAILABLE',
        requested: input.quantity,
        added: 0,
      })
      continue
    }

    // Clampa no que existe: o disponível já desconta o que está no carrinho.
    const room = check.ok ? input.quantity : Math.max(0, check.available - alreadyInCart)

    if (room === 0) {
      result.skipped.push({
        productName: input.productName,
        reason: 'OUT_OF_STOCK',
        requested: input.quantity,
        added: 0,
      })
      continue
    }

    await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId: input.variantId } },
      create: { cartId, variantId: input.variantId, quantity: room },
      update: { quantity: alreadyInCart + room },
    })

    result.added.push({
      variantId: input.variantId,
      productName: input.productName,
      quantity: room,
    })

    if (room < input.quantity) {
      result.skipped.push({
        productName: input.productName,
        reason: 'PARTIAL',
        requested: input.quantity,
        added: room,
      })
    }
  }

  if (result.added.length > 0) await touch(cartId)
  return result
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
