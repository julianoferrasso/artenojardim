import {
  ERROR_CODES,
  type AppliedCoupon,
  type Coupon,
  type CreateCouponInput,
  type UpdateCouponInput,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { spDayStart, spDayEnd } from '@ecommerce/shared/utils'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { appError, conflict, notFound, type AppError } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit, diff, type AuditContext } from '../../shared/audit.js'
import { resolveCart, getCart } from '../cart/service.js'
import {
  checkCouponEligibility,
  computeCouponDiscount,
  type CouponIneligibility,
} from './domain/rules.js'

/**
 * Cupons. Um uso = um pedido NÃO cancelado com couponId — é a verdade. O
 * `usageCount` é o cache que deixa o limite total atômico: sobe dentro da
 * transação do confirm, desce dentro da do cancelamento. Sem tabela de usos.
 */

const SELECT = {
  id: true,
  code: true,
  type: true,
  value: true,
  minOrderValue: true,
  usageLimit: true,
  usageCount: true,
  usageLimitPerCustomer: true,
  startsAt: true,
  endsAt: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CouponSelect

type Row = Prisma.CouponGetPayload<{ select: typeof SELECT }>

const toDTO = (row: Row): Coupon => ({
  id: row.id,
  code: row.code,
  type: row.type,
  value: row.value,
  minOrderValue: row.minOrderValue,
  usageLimit: row.usageLimit,
  usageCount: row.usageCount,
  usageLimitPerCustomer: row.usageLimitPerCustomer,
  startsAt: row.startsAt?.toISOString() ?? null,
  endsAt: row.endsAt?.toISOString() ?? null,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

/** O dia vira instante no fuso de São Paulo: o cupom "até 30/11" vale até 23:59 de Brasília. */
const toData = (input: UpdateCouponInput) => ({
  type: input.type,
  value: input.type === 'FREE_SHIPPING' ? 0 : input.value,
  // 0 no MoneyInput = sem mínimo.
  minOrderValue: input.minOrderValue || null,
  usageLimit: input.usageLimit,
  usageLimitPerCustomer: input.usageLimitPerCustomer,
  startsAt: input.startsAt ? spDayStart(input.startsAt) : null,
  endsAt: input.endsAt ? spDayEnd(input.endsAt) : null,
  isActive: input.isActive,
})

const auditable = (row: Row) => ({
  type: row.type,
  value: row.value,
  minOrderValue: row.minOrderValue,
  usageLimit: row.usageLimit,
  usageLimitPerCustomer: row.usageLimitPerCustomer,
  startsAt: row.startsAt,
  endsAt: row.endsAt,
  isActive: row.isActive,
})

// ── Staff ────────────────────────────────────────────────────────────────────

/** Sem paginação: uma loja deste porte tem dezenas de cupons, não milhares. */
export const listCoupons = async (): Promise<Coupon[]> => {
  const rows = await prisma.coupon.findMany({
    where: { storeId: getActiveStoreId() },
    select: SELECT,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toDTO)
}

const isCodeTaken = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'

export const createCoupon = async (input: CreateCouponInput, ctx: AuditContext): Promise<Coupon> => {
  let row: Row
  try {
    row = await prisma.coupon.create({
      data: { storeId: getActiveStoreId(), code: input.code, ...toData(input) },
      select: SELECT,
    })
  } catch (err) {
    if (isCodeTaken(err)) {
      throw conflict('Já existe um cupom com este código.', ERROR_CODES.COUPON_CODE_TAKEN)
    }
    throw err
  }

  await audit({
    action: EVENTS.coupon.created,
    entityType: 'Coupon',
    entityId: row.id,
    changes: {
      code: { from: null, to: row.code },
      type: { from: null, to: row.type },
      value: { from: null, to: row.value },
    },
    context: ctx,
  })

  return toDTO(row)
}

export const updateCoupon = async (
  id: string,
  input: UpdateCouponInput,
  ctx: AuditContext,
): Promise<Coupon> => {
  const current = await prisma.coupon.findFirst({
    where: { id, storeId: getActiveStoreId() },
    select: SELECT,
  })
  if (!current) throw notFound('Cupom')

  const row = await prisma.coupon.update({ where: { id }, data: toData(input), select: SELECT })

  const changes = diff(auditable(current), auditable(row))
  if (Object.keys(changes).length > 0) {
    await audit({
      action: EVENTS.coupon.updated,
      entityType: 'Coupon',
      entityId: id,
      changes,
      context: ctx,
    })
  }

  return toDTO(row)
}

/**
 * Só apaga cupom que nunca esteve em pedido — nem cancelado. O pedido guarda o
 * snapshot do código, mas o vínculo é o que responde "quanto este cupom rendeu".
 * A FK Restrict é a rede de segurança; a contagem aqui é para a mensagem boa.
 */
export const deleteCoupon = async (id: string, ctx: AuditContext): Promise<void> => {
  const storeId = getActiveStoreId()
  const coupon = await prisma.coupon.findFirst({
    where: { id, storeId },
    select: { id: true, code: true },
  })
  if (!coupon) throw notFound('Cupom')

  const orders = await prisma.order.count({ where: { storeId, couponId: id } })
  if (orders > 0) {
    throw conflict(
      'Este cupom já foi usado em pedidos. Desative-o em vez de excluir.',
      ERROR_CODES.COUPON_IN_USE,
    )
  }

  await prisma.coupon.delete({ where: { id } })

  await audit({
    action: EVENTS.coupon.deleted,
    entityType: 'Coupon',
    entityId: id,
    changes: { code: { from: coupon.code, to: null } },
    context: ctx,
  })
}

// ── Cliente / checkout ───────────────────────────────────────────────────────

const RULE_SELECT = {
  id: true,
  code: true,
  type: true,
  value: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
  minOrderValue: true,
  usageLimit: true,
  usageCount: true,
  usageLimitPerCustomer: true,
} satisfies Prisma.CouponSelect

export type CheckoutCoupon = Prisma.CouponGetPayload<{ select: typeof RULE_SELECT }>

const INELIGIBLE_MESSAGE: Record<CouponIneligibility, string> = {
  COUPON_NOT_FOUND: 'Cupom inválido.',
  COUPON_EXPIRED: 'Este cupom expirou.',
  COUPON_USAGE_LIMIT_REACHED: 'Este cupom esgotou.',
  COUPON_ALREADY_USED: 'Você já usou este cupom.',
  COUPON_MIN_ORDER_NOT_MET: 'O pedido não atingiu o valor mínimo deste cupom.',
}

/** O mínimo viaja em details para a loja formatar "pedido mínimo de R$ X". */
const ineligible = (code: CouponIneligibility, minOrderValue?: number | null): AppError =>
  appError(
    code,
    INELIGIBLE_MESSAGE[code],
    422,
    code === ERROR_CODES.COUPON_MIN_ORDER_NOT_MET && minOrderValue
      ? [{ field: 'minOrderValue', message: String(minOrderValue) }]
      : undefined,
  )

/**
 * Acha o cupom e confere se vale para este cliente e este subtotal. Lança com o
 * code do motivo. Usado pela validação da loja e pelo prepare do checkout.
 */
export const resolveCoupon = async (
  customerId: string,
  code: string,
  subtotal: number,
): Promise<CheckoutCoupon> => {
  const storeId = getActiveStoreId()
  const coupon = await prisma.coupon.findUnique({
    where: { storeId_code: { storeId, code } },
    select: RULE_SELECT,
  })
  if (!coupon) throw ineligible(ERROR_CODES.COUPON_NOT_FOUND)

  const customerUses =
    coupon.usageLimitPerCustomer === null
      ? 0
      : await prisma.order.count({
          where: { storeId, couponId: coupon.id, customerId, canceledAt: null },
        })

  const problem = checkCouponEligibility(coupon, { now: new Date(), subtotal, customerUses })
  if (problem) throw ineligible(problem, coupon.minOrderValue)

  return coupon
}

/**
 * Prévia para a tela de checkout, contra o carrinho atual. O frete ainda não
 * entra: em FREE_SHIPPING a loja mostra como desconto o frete que o cliente
 * escolher. O confirm recalcula tudo — este número nunca é usado para cobrar.
 */
export const validateCouponForCart = async (
  customerId: string,
  code: string,
): Promise<AppliedCoupon> => {
  const { cartId } = await resolveCart({ customerId })
  const cart = await getCart(cartId)
  if (cart.subtotal === 0) {
    throw appError(ERROR_CODES.CART_EMPTY, 'Seu carrinho está vazio.', 400)
  }

  const coupon = await resolveCoupon(customerId, code, cart.subtotal)
  const { products } = computeCouponDiscount(coupon, { subtotal: cart.subtotal, shipping: 0 })
  return { code: coupon.code, type: coupon.type, discountCents: products }
}

/**
 * Ocupa um uso, DENTRO da transação do pedido. O UPDATE com a condição no WHERE
 * é o mesmo truque da reserva de estoque: o banco arbitra a última vaga, sem
 * SELECT antes. Ele também trava a linha do cupom até o commit — por isso a
 * recontagem por cliente logo abaixo já enxerga o pedido de um confirm
 * simultâneo do mesmo cliente, e o segundo leva 422 em vez de passar junto.
 */
export const claimCouponUse = async (
  tx: Prisma.TransactionClient,
  coupon: Pick<CheckoutCoupon, 'id' | 'usageLimitPerCustomer'>,
  customerId: string,
): Promise<void> => {
  const storeId = getActiveStoreId()
  const affected = await tx.$executeRaw`
    UPDATE "Coupon"
       SET "usageCount" = "usageCount" + 1
     WHERE id = ${coupon.id}
       AND "storeId" = ${storeId}
       AND ("usageLimit" IS NULL OR "usageCount" < "usageLimit")
  `
  if (affected === 0) throw ineligible(ERROR_CODES.COUPON_USAGE_LIMIT_REACHED)

  if (coupon.usageLimitPerCustomer !== null) {
    const uses = await tx.order.count({
      where: { storeId, couponId: coupon.id, customerId, canceledAt: null },
    })
    if (uses >= coupon.usageLimitPerCustomer) throw ineligible(ERROR_CODES.COUPON_ALREADY_USED)
  }
}

/** Devolve o uso de um pedido cancelado. Chamado uma vez só: o cancelamento reivindica o pedido antes. */
export const releaseCouponUse = async (
  tx: Prisma.TransactionClient,
  couponId: string,
): Promise<void> => {
  await tx.$executeRaw`
    UPDATE "Coupon"
       SET "usageCount" = "usageCount" - 1
     WHERE id = ${couponId}
       AND "storeId" = ${getActiveStoreId()}
       AND "usageCount" > 0
  `
}
