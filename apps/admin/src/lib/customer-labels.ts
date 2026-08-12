import type { AdminCustomer } from '@ecommerce/shared/contracts'

/**
 * Rótulos e formatadores da tela de clientes. Espelha `order-labels.ts`: as
 * classes de cor ficam no admin e usam token semântico, nunca hex — dois mapas
 * soltos viram, em três meses, um "Confirmado" verde numa tela e azul na outra.
 */

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativos' },
  { value: 'deleted', label: 'Excluídos' },
  { value: 'all', label: 'Todos' },
] as const

export const VERIFIED_OPTIONS = [
  { value: 'all', label: 'E-mail: todos' },
  { value: 'yes', label: 'E-mail confirmado' },
  { value: 'no', label: 'E-mail pendente' },
] as const

export const MARKETING_OPTIONS = [
  { value: 'all', label: 'Marketing: todos' },
  { value: 'yes', label: 'Aceita e-mails' },
  { value: 'no', label: 'Não aceita' },
] as const

export const SORT_OPTIONS = [
  { value: '-createdAt', label: 'Mais recentes' },
  { value: 'createdAt', label: 'Mais antigos' },
  { value: 'name', label: 'Nome (A–Z)' },
  { value: '-name', label: 'Nome (Z–A)' },
  { value: '-lastLoginAt', label: 'Último acesso' },
] as const

/**
 * CPF/CNPJ com máscara. O dado pode chegar cru ou já mascarado conforme o fluxo
 * que o gravou — normalizamos antes de formatar.
 */
export const formatDocument = (value: string | null): string => {
  if (!value) return '—'
  const d = value.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  }
  return value
}

/** Esconde o miolo do documento. Balcão é lugar público; o valor inteiro só
 *  aparece quando o operador pede. */
export const maskDocument = (value: string | null): string => {
  if (!value) return '—'
  const formatted = formatDocument(value)
  return formatted.replace(/\d(?=.*\d{2})/g, (char, index: number) => (index < 4 ? '•' : char))
}

/**
 * Estado da conta em UMA frase — a informação que resolve o chamado e que hoje
 * ninguém consegue ver. Função pura: recebe só o que precisa.
 */
export const accountState = (
  customer: Pick<AdminCustomer, 'emailVerified' | 'deletedAt'> & {
    activity: Pick<AdminCustomer['activity'], 'hasPassword' | 'pendingEmailVerification'>
  },
): string => {
  if (customer.deletedAt) return 'Conta removida/anonimizada.'
  if (!customer.activity.hasPassword) return 'Comprou como convidado — nunca criou senha.'
  if (customer.activity.pendingEmailVerification) {
    return 'Cadastrou-se mas ainda não confirmou o e-mail (não consegue entrar).'
  }
  return 'Conta ativa e com e-mail confirmado.'
}

export const VERIFIED_BADGE_CLASS = {
  yes: 'bg-success/15 text-success border-success/30',
  no: 'bg-warning/15 text-warning-foreground border-warning/30',
} as const
