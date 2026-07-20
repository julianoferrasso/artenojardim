import {
  ERROR_CODES,
  DENIAL_MESSAGE,
  canManageUser,
  breaksLastOwner,
  type Actor,
  type Decision,
  type StaffUser,
  type CreateStaffUserInput,
  type UpdateStaffUserInput,
  type ResetStaffPasswordInput,
  type StaffUserListQuery,
} from '@ecommerce/shared/contracts'
import { EVENTS, ROLE_RANK } from '@ecommerce/shared/constants'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { notFound, conflict, forbidden } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit, diff, type AuditContext } from '../../shared/audit.js'
import { toPrismaPagination, buildMeta } from '../../shared/pagination.js'
import { hashPassword } from '../../utils/crypto.js'
import { revokeAllUserSessions } from '../auth/service.js'

/** `passwordHash` NUNCA entra aqui — o select é o que garante que ele não sai. */
const SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect

type Row = Prisma.UserGetPayload<{ select: typeof SELECT }>

const toDTO = (row: Row): StaffUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  isActive: row.isActive,
  lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

/**
 * Traduz a decisão pura em AppError. Um lugar só — se um dia a negativa precisar
 * de código próprio por motivo, muda aqui e em nenhum call site.
 */
const assertAllowed = (decision: Decision): void => {
  if (!decision.allowed) throw forbidden(DENIAL_MESSAGE[decision.reason])
}

const loadTarget = async (id: string): Promise<Row> => {
  const row = await prisma.user.findFirst({
    where: { id, storeId: getActiveStoreId() },
    select: SELECT,
  })
  if (!row) throw notFound('Usuário')
  return row
}

const countActiveOwners = (): Promise<number> =>
  prisma.user.count({
    where: { storeId: getActiveStoreId(), role: 'OWNER', isActive: true },
  })

/**
 * Pré-checagem para dar mensagem boa. Não é atômica — o catch de P2002 no create
 * cobre a corrida entre dois admins cadastrando o mesmo e-mail no mesmo segundo.
 */
const assertEmailFree = async (email: string, excludeId?: string): Promise<void> => {
  const existing = await prisma.user.findFirst({
    where: {
      storeId: getActiveStoreId(),
      email,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  })
  if (existing) {
    throw conflict('Já existe um usuário com este e-mail', ERROR_CODES.EMAIL_ALREADY_EXISTS)
  }
}

export const listStaffUsers = async (
  query: StaffUserListQuery,
): Promise<{ items: StaffUser[]; total: number }> => {
  const where: Prisma.UserWhereInput = { storeId: getActiveStoreId() }

  // `all` omite a chave; os outros dois viram booleano. Enum e não boolean
  // justamente porque `Boolean('false') === true` em query string.
  if (query.status !== 'all') where.isActive = query.status === 'active'
  if (query.role) where.role = query.role
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { email: { contains: query.q, mode: 'insensitive' } },
    ]
  }

  // `nulls: 'last'` em lastLoginAt: no Postgres DESC põe NULL primeiro, e
  // "nunca acessou" no topo de "acesso mais recente" parece bug.
  const orderBy: Prisma.UserOrderByWithRelationInput[] = query.sort
    ? [
        query.sort.field === 'lastLoginAt'
          ? { lastLoginAt: { sort: query.sort.direction, nulls: 'last' } }
          : { [query.sort.field]: query.sort.direction },
      ]
    : [{ isActive: 'desc' }, { name: 'asc' }]

  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, select: SELECT, orderBy, ...toPrismaPagination(query) }),
    prisma.user.count({ where }),
  ])

  return { items: rows.map(toDTO), total }
}

export const getStaffUser = async (id: string): Promise<StaffUser> => toDTO(await loadTarget(id))

export const createStaffUser = async (
  actor: Actor,
  input: CreateStaffUserInput,
  ctx: AuditContext,
): Promise<StaffUser> => {
  // Alvo sintético: na criação não há alvo ainda, mas a mesma regra vale — é o
  // `nextRole` que barra um ADMIN tentando criar um OWNER.
  assertAllowed(
    canManageUser(actor, { id: '', role: input.role, isActive: true }, 'create', input.role),
  )

  await assertEmailFree(input.email)

  const passwordHash = await hashPassword(input.password)

  let row: Row
  try {
    row = await prisma.user.create({
      data: {
        storeId: getActiveStoreId(),
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
      },
      select: SELECT,
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('Já existe um usuário com este e-mail', ERROR_CODES.EMAIL_ALREADY_EXISTS)
    }
    throw err
  }

  await audit({
    action: EVENTS.user.created,
    entityType: 'User',
    entityId: row.id,
    changes: {
      name: { from: null, to: row.name },
      email: { from: null, to: row.email },
      role: { from: null, to: row.role },
    },
    context: ctx,
  })

  return toDTO(row)
}

export const updateStaffUser = async (
  actor: Actor,
  id: string,
  input: UpdateStaffUserInput,
  ctx: AuditContext,
): Promise<StaffUser> => {
  const target = await loadTarget(id)
  const nextRole = input.role ?? target.role

  assertAllowed(canManageUser(actor, target, 'update', nextRole))

  if (
    breaksLastOwner({
      target,
      nextRole,
      nextActive: target.isActive,
      activeOwnerCount: await countActiveOwners(),
    })
  ) {
    throw conflict(DENIAL_MESSAGE.LAST_ACTIVE_OWNER, ERROR_CODES.CONFLICT)
  }

  if (input.email !== undefined && input.email !== target.email) {
    await assertEmailFree(input.email, id)
  }

  // Campo a campo por causa de exactOptionalPropertyTypes: spread do input
  // colocaria `undefined` explícito no data.
  const data: Prisma.UserUpdateInput = {}
  if (input.name !== undefined) data.name = input.name
  if (input.email !== undefined) data.email = input.email
  if (input.role !== undefined) data.role = input.role

  const row = await prisma.user.update({ where: { id }, data, select: SELECT })

  if (row.role !== target.role) {
    await audit({
      action: EVENTS.user.roleChanged,
      entityType: 'User',
      entityId: id,
      changes: { role: { from: target.role, to: row.role } },
      context: ctx,
    })

    // Rebaixamento derruba sessões AGORA: o role viaja no access token, e
    // redução de privilégio não pode esperar os 15min do TTL. Promoção pode —
    // o refresh relê o banco e entrega as claims novas sem derrubar ninguém.
    if (ROLE_RANK[row.role] < ROLE_RANK[target.role]) await revokeAllUserSessions(id)
  }

  const changes = diff(
    { name: target.name, email: target.email, role: target.role },
    { name: row.name, email: row.email, role: row.role },
  )

  // Salvar o formulário sem tocar em nada não vira log.
  if (Object.keys(changes).length > 0) {
    await audit({
      action: EVENTS.user.updated,
      entityType: 'User',
      entityId: id,
      changes,
      context: ctx,
    })
  }

  return toDTO(row)
}

export const deactivateStaffUser = async (
  actor: Actor,
  id: string,
  ctx: AuditContext,
): Promise<StaffUser> => {
  const target = await loadTarget(id)

  assertAllowed(canManageUser(actor, target, 'deactivate'))

  // Idempotente: desativar quem já está inativo não é erro nem vira log.
  if (!target.isActive) return toDTO(target)

  if (
    breaksLastOwner({
      target,
      nextRole: target.role,
      nextActive: false,
      activeOwnerCount: await countActiveOwners(),
    })
  ) {
    throw conflict(DENIAL_MESSAGE.LAST_ACTIVE_OWNER, ERROR_CODES.CONFLICT)
  }

  const row = await prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: SELECT,
  })

  // A linha que faz a desativação valer: sem ela o acesso só cairia na próxima
  // renovação de token, até 15 minutos depois.
  await revokeAllUserSessions(id)

  await audit({
    action: EVENTS.user.deactivated,
    entityType: 'User',
    entityId: id,
    changes: { isActive: { from: true, to: false } },
    context: ctx,
  })

  return toDTO(row)
}

export const reactivateStaffUser = async (
  actor: Actor,
  id: string,
  ctx: AuditContext,
): Promise<StaffUser> => {
  const target = await loadTarget(id)

  assertAllowed(canManageUser(actor, target, 'reactivate'))

  if (target.isActive) return toDTO(target)

  const row = await prisma.user.update({
    where: { id },
    data: { isActive: true },
    select: SELECT,
  })

  // Sem revoke: não há sessão viva para derrubar.
  await audit({
    action: EVENTS.user.reactivated,
    entityType: 'User',
    entityId: id,
    changes: { isActive: { from: false, to: true } },
    context: ctx,
  })

  return toDTO(row)
}

export const resetStaffPassword = async (
  actor: Actor,
  id: string,
  input: ResetStaffPasswordInput,
  ctx: AuditContext,
): Promise<void> => {
  const target = await loadTarget(id)

  assertAllowed(canManageUser(actor, target, 'resetPassword'))

  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(input.password) },
  })

  // Trocar credencial sem encerrar as sessões é senha trocada pela metade.
  await revokeAllUserSessions(id)

  // Sem `changes`: não há nada auditável aqui que não seja o próprio segredo.
  await audit({
    action: EVENTS.user.passwordReset,
    entityType: 'User',
    entityId: id,
    context: ctx,
  })
}
