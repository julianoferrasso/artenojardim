import { describe, it, expect } from 'vitest'
import {
  canManageUser,
  canManageUsers,
  breaksLastOwner,
  DENIAL_REASONS,
  DENIAL_MESSAGE,
  updateStaffUserSchema,
  type Actor,
  type TargetUser,
} from '@ecommerce/shared/contracts'

/**
 * A decisão de permissão é pura de propósito — é o que permite testar a matriz
 * inteira sem banco, sem HTTP e sem sessão. Se um dia precisar de mock aqui, a
 * função deixou de ser pura e o RBAC futuro ficou mais caro.
 */

const owner: Actor = { id: 'u-owner', role: 'OWNER' }
const admin: Actor = { id: 'u-admin', role: 'ADMIN' }
const staff: Actor = { id: 'u-staff', role: 'STAFF' }

const target = (over: Partial<TargetUser> = {}): TargetUser => ({
  id: 'u-target',
  role: 'STAFF',
  isActive: true,
  ...over,
})

const reasonOf = (d: ReturnType<typeof canManageUser>) => (d.allowed ? null : d.reason)

describe('canManageUsers', () => {
  it('exige cargo mínimo ADMIN', () => {
    expect(canManageUsers(owner)).toBe(true)
    expect(canManageUsers(admin)).toBe(true)
    expect(canManageUsers(staff)).toBe(false)
  })
})

describe('canManageUser — hierarquia', () => {
  it('STAFF é negado em todas as ações', () => {
    for (const action of ['create', 'update', 'deactivate', 'reactivate', 'resetPassword'] as const) {
      expect(reasonOf(canManageUser(staff, target(), action))).toBe(DENIAL_REASONS.NOT_A_MANAGER)
    }
  })

  it('ADMIN não mexe em OWNER', () => {
    expect(reasonOf(canManageUser(admin, target({ role: 'OWNER' }), 'update'))).toBe(
      DENIAL_REASONS.TARGET_OUTRANKS_ACTOR,
    )
    expect(reasonOf(canManageUser(admin, target({ role: 'OWNER' }), 'deactivate'))).toBe(
      DENIAL_REASONS.TARGET_OUTRANKS_ACTOR,
    )
  })

  it('ADMIN cria STAFF e ADMIN, mas não OWNER', () => {
    expect(canManageUser(admin, target({ role: 'STAFF' }), 'create', 'STAFF').allowed).toBe(true)
    expect(canManageUser(admin, target({ role: 'ADMIN' }), 'create', 'ADMIN').allowed).toBe(true)
    expect(reasonOf(canManageUser(admin, target({ role: 'OWNER' }), 'create', 'OWNER'))).toBe(
      DENIAL_REASONS.ROLE_ABOVE_ACTOR,
    )
  })

  it('ADMIN não promove ninguém a OWNER', () => {
    expect(reasonOf(canManageUser(admin, target({ role: 'STAFF' }), 'update', 'OWNER'))).toBe(
      DENIAL_REASONS.ROLE_ABOVE_ACTOR,
    )
  })

  it('OWNER passa em tudo que não seja sobre si', () => {
    for (const role of ['OWNER', 'ADMIN', 'STAFF'] as const) {
      expect(canManageUser(owner, target({ role }), 'update', role).allowed).toBe(true)
      expect(canManageUser(owner, target({ role }), 'deactivate').allowed).toBe(true)
    }
  })
})

describe('canManageUser — ações sobre si mesmo', () => {
  const self = (over: Partial<TargetUser> = {}) => target({ id: owner.id, role: 'OWNER', ...over })

  it('não permite desativar a própria conta', () => {
    expect(reasonOf(canManageUser(owner, self(), 'deactivate'))).toBe(
      DENIAL_REASONS.CANNOT_DEACTIVATE_SELF,
    )
  })

  it('não permite alterar o próprio cargo, nem para cima nem para baixo', () => {
    expect(reasonOf(canManageUser(owner, self(), 'update', 'ADMIN'))).toBe(
      DENIAL_REASONS.CANNOT_CHANGE_OWN_ROLE,
    )
    expect(reasonOf(canManageUser(admin, target({ id: admin.id, role: 'ADMIN' }), 'update', 'STAFF'))).toBe(
      DENIAL_REASONS.CANNOT_CHANGE_OWN_ROLE,
    )
  })

  it('permite editar os próprios dados mantendo o cargo', () => {
    expect(canManageUser(owner, self(), 'update', 'OWNER').allowed).toBe(true)
    expect(canManageUser(owner, self(), 'update').allowed).toBe(true)
  })

  it('permite redefinir a própria senha — não há outro caminho para staff', () => {
    expect(canManageUser(owner, self(), 'resetPassword').allowed).toBe(true)
  })
})

describe('breaksLastOwner', () => {
  const ownerTarget = target({ role: 'OWNER', isActive: true })

  it('bloqueia rebaixar o último OWNER ativo', () => {
    expect(
      breaksLastOwner({ target: ownerTarget, nextRole: 'ADMIN', nextActive: true, activeOwnerCount: 1 }),
    ).toBe(true)
  })

  it('bloqueia desativar o último OWNER ativo', () => {
    expect(
      breaksLastOwner({ target: ownerTarget, nextRole: 'OWNER', nextActive: false, activeOwnerCount: 1 }),
    ).toBe(true)
  })

  it('libera quando há um segundo OWNER ativo', () => {
    expect(
      breaksLastOwner({ target: ownerTarget, nextRole: 'ADMIN', nextActive: true, activeOwnerCount: 2 }),
    ).toBe(false)
  })

  it('ignora alvo que não é OWNER ativo', () => {
    expect(
      breaksLastOwner({
        target: target({ role: 'OWNER', isActive: false }),
        nextRole: 'ADMIN',
        nextActive: true,
        activeOwnerCount: 1,
      }),
    ).toBe(false)
    expect(
      breaksLastOwner({
        target: target({ role: 'ADMIN' }),
        nextRole: 'STAFF',
        nextActive: false,
        activeOwnerCount: 1,
      }),
    ).toBe(false)
  })

  it('libera quando o OWNER continua OWNER e ativo', () => {
    expect(
      breaksLastOwner({ target: ownerTarget, nextRole: 'OWNER', nextActive: true, activeOwnerCount: 1 }),
    ).toBe(false)
  })
})

describe('contrato', () => {
  it('toda negativa tem mensagem — o front usa este mapa no tooltip', () => {
    for (const reason of Object.values(DENIAL_REASONS)) {
      expect(DENIAL_MESSAGE[reason]).toBeTruthy()
    }
  })

  it('update não aceita senha — troca de senha tem endpoint próprio', () => {
    const parsed = updateStaffUserSchema.safeParse({ password: 'senha-bem-longa' })
    expect(parsed.success).toBe(false)
  })

  it('update exige ao menos um campo', () => {
    expect(updateStaffUserSchema.safeParse({}).success).toBe(false)
    expect(updateStaffUserSchema.safeParse({ name: 'Maria Silva' }).success).toBe(true)
  })
})
