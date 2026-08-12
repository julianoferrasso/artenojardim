/**
 * Funções PURAS sobre a lista de destinatários: sem Prisma, sem fetch, sem
 * Date.now(). Vivem aqui porque a exclusão é onde o bug mora — um endereço com
 * caixa diferente dos dois lados faz o desmarcado receber o e-mail assim mesmo,
 * e isso precisa ser testável sem banco.
 */

export type Recipient = {
  email: string
  name: string | null
  customerId: string | null
  source: string
}

const normalize = (email: string): string => email.trim().toLowerCase()

/**
 * Remove do envio os endereços que o lojista desmarcou.
 *
 * Normaliza os DOIS lados: o que veio do banco e o que voltou do formulário. O
 * front devolve o que recebeu, mas basta um endereço gravado com maiúscula em
 * algum ponto da história para a comparação crua falhar em silêncio — e falhar
 * aqui significa mandar o e-mail para quem foi explicitamente desmarcado.
 */
export const excludeRecipients = <T extends Recipient>(all: T[], excluded: string[]): T[] => {
  if (excluded.length === 0) return all

  const blocked = new Set(excluded.map(normalize))
  return all.filter((recipient) => !blocked.has(normalize(recipient.email)))
}

/** Fatia uma página da lista. `page` começa em 1 (é o que o contrato expõe). */
export const paginateRecipients = <T>(all: T[], page: number, perPage: number): T[] =>
  all.slice((page - 1) * perPage, page * perPage)
