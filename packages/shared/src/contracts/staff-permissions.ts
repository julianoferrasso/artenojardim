import { ROLE_RANK, type UserRole } from '../constants/enums.js'

/**
 * Quem pode o quê sobre um usuário de staff — a decisão PURA que a API impõe e
 * que o admin usa para desabilitar botão.
 *
 * Vive aqui, e não espalhada em ifs no service, por um motivo concreto: é o
 * ponto de extensão de permissões granulares. Quando `role` deixar de ser a
 * única fonte da resposta, o corpo destas funções muda e nenhum chamador muda.
 *
 * Nada aqui é segurança sozinho: a resposta autoritativa é sempre a do service.
 * O front chama isto só para não oferecer uma porta que não abre.
 */

export type StaffAction = 'create' | 'update' | 'deactivate' | 'reactivate' | 'resetPassword'

export type Actor = { id: string; role: UserRole }

export type TargetUser = { id: string; role: UserRole; isActive: boolean }

export const DENIAL_REASONS = {
  NOT_A_MANAGER: 'NOT_A_MANAGER',
  TARGET_OUTRANKS_ACTOR: 'TARGET_OUTRANKS_ACTOR',
  ROLE_ABOVE_ACTOR: 'ROLE_ABOVE_ACTOR',
  CANNOT_CHANGE_OWN_ROLE: 'CANNOT_CHANGE_OWN_ROLE',
  CANNOT_DEACTIVATE_SELF: 'CANNOT_DEACTIVATE_SELF',
  LAST_ACTIVE_OWNER: 'LAST_ACTIVE_OWNER',
} as const

export type DenialReason = (typeof DENIAL_REASONS)[keyof typeof DENIAL_REASONS]

/**
 * Mensagem única para os dois lados: o service manda no corpo do erro, o admin
 * põe no tooltip do botão desabilitado. Mesma frase, um lugar só.
 */
export const DENIAL_MESSAGE: Record<DenialReason, string> = {
  NOT_A_MANAGER: 'Você não tem permissão para gerenciar usuários',
  TARGET_OUTRANKS_ACTOR: 'Você não pode alterar um usuário com cargo superior ao seu',
  ROLE_ABOVE_ACTOR: 'Você não pode conceder um cargo superior ao seu',
  CANNOT_CHANGE_OWN_ROLE: 'Você não pode alterar o próprio cargo',
  CANNOT_DEACTIVATE_SELF: 'Você não pode desativar a própria conta',
  LAST_ACTIVE_OWNER: 'Esta é a última conta de proprietário ativa da loja',
}

export type Decision = { allowed: true } | { allowed: false; reason: DenialReason }

const ALLOW: Decision = { allowed: true }
const deny = (reason: DenialReason): Decision => ({ allowed: false, reason })

/** Piso para tocar em usuários. Gerenciar staff não é tarefa de STAFF. */
export const MANAGE_USERS_MIN_ROLE: UserRole = 'ADMIN'

export const canManageUsers = (actor: Actor): boolean =>
  ROLE_RANK[actor.role] >= ROLE_RANK[MANAGE_USERS_MIN_ROLE]

/**
 * `nextRole` só importa em 'create' e 'update'; nas demais ações é ignorado.
 *
 * O invariante do último OWNER NÃO está aqui: depende de uma contagem no banco,
 * e misturar I/O nesta assinatura mataria a pureza. Ver `breaksLastOwner`,
 * chamado logo em seguida pelo service.
 */
export const canManageUser = (
  actor: Actor,
  target: TargetUser,
  action: StaffAction,
  nextRole?: UserRole,
): Decision => {
  if (!canManageUsers(actor)) return deny(DENIAL_REASONS.NOT_A_MANAGER)

  const actorRank = ROLE_RANK[actor.role]
  const isSelf = actor.id === target.id

  // Não se mexe em quem está acima. Sem isto, um ADMIN desativa o OWNER.
  //
  // Não vale para 'create': ali não existe alvo, e o `target` que o service
  // passa é sintético. Aplicar a regra aqui daria a negativa certa pelo motivo
  // errado — "não pode alterar um usuário superior" numa tela de cadastro. Quem
  // barra um ADMIN criando OWNER é a checagem de `nextRole`, logo abaixo.
  if (action !== 'create' && !isSelf && ROLE_RANK[target.role] > actorRank) {
    return deny(DENIAL_REASONS.TARGET_OUTRANKS_ACTOR)
  }

  // Ninguém concede o que não tem — é escalada de privilégio na forma mais
  // simples possível. É esta linha que faz "só OWNER cria/promove OWNER".
  if (nextRole !== undefined && ROLE_RANK[nextRole] > actorRank) {
    return deny(DENIAL_REASONS.ROLE_ABOVE_ACTOR)
  }

  switch (action) {
    case 'update':
      // Promover-se é escalada; rebaixar-se é o tiro no pé que deixa a loja sem
      // dono. Os dois são a mesma proibição.
      if (isSelf && nextRole !== undefined && nextRole !== target.role) {
        return deny(DENIAL_REASONS.CANNOT_CHANGE_OWN_ROLE)
      }
      return ALLOW

    case 'deactivate':
      if (isSelf) return deny(DENIAL_REASONS.CANNOT_DEACTIVATE_SELF)
      return ALLOW

    case 'create':
    case 'reactivate':
    // Redefinir a PRÓPRIA senha é permitido: não existe outro caminho para o
    // staff trocar a senha (o fluxo de forgot-password é só do cliente). O
    // preço é sair da sessão — ver revokeAllUserSessions no service.
    case 'resetPassword':
      return ALLOW
  }
}

/**
 * A loja não pode ficar sem OWNER ativo. Recebe a contagem já lida do banco
 * para continuar pura e testável.
 */
export const breaksLastOwner = (args: {
  target: TargetUser
  nextRole: UserRole
  nextActive: boolean
  activeOwnerCount: number
}): boolean => {
  const { target, nextRole, nextActive, activeOwnerCount } = args
  const wasActiveOwner = target.role === 'OWNER' && target.isActive
  if (!wasActiveOwner) return false
  const stillActiveOwner = nextRole === 'OWNER' && nextActive
  return !stillActiveOwner && activeOwnerCount <= 1
}
