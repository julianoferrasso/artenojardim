/**
 * Funções PURAS do estoque: reconstroem saldo e extrato a partir dos movimentos.
 * Sem Prisma, sem I/O — o coração do "o onHand é derivado, não a verdade".
 */

export type Movement = {
  quantity: number // com sinal
  createdAt: Date
}

/**
 * Saldo a partir dos movimentos: a soma das quantidades.
 *
 * É a definição de "quanto tem" que o campo mutável não consegue dar. Um
 * `SELECT SUM(quantity)` no banco faz o mesmo; esta versão pura existe para o
 * job de auditoria comparar projeção × ledger sem depender de como a query roda.
 */
export const balanceFrom = (movements: Array<{ quantity: number }>): number =>
  movements.reduce((sum, m) => sum + m.quantity, 0)

/**
 * Saldo até uma data (estoque retroativo): "quanto eu tinha em 31/12?".
 * Impossível com um campo mutável — é o que o ledger compra de graça.
 */
export const balanceAt = (movements: Movement[], at: Date): number =>
  movements.filter((m) => m.createdAt <= at).reduce((sum, m) => sum + m.quantity, 0)

export type MovementWithBalance<T extends Movement> = T & { runningBalance: number }

/**
 * Extrato com saldo acumulado: cada linha mostra o saldo depois dela.
 *
 * Recebe os movimentos em ordem CRONOLÓGICA (mais antigo primeiro), acumula, e
 * devolve na ordem inversa (mais recente primeiro) — que é como o admin exibe.
 * O saldo acumulado é o que responde "o estoque estava certo até quando?".
 */
export const withRunningBalance = <T extends Movement>(
  chronological: T[],
): Array<MovementWithBalance<T>> => {
  let running = 0
  const withBalance = chronological.map((m) => {
    running += m.quantity
    return { ...m, runningBalance: running }
  })
  return withBalance.reverse()
}

/**
 * Valida um COUNT (inventário físico): o admin informa a contagem real, e o
 * movimento gravado é a DIFERENÇA para o saldo atual. Contou 8, o sistema tinha
 * 10 → movimento de −2. Contou 12 → +2. É assim que o inventário vira um
 * movimento auditável em vez de sobrescrever o saldo.
 */
export const countDelta = (currentOnHand: number, counted: number): number =>
  counted - currentOnHand
