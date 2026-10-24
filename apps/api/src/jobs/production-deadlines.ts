import { sendProductionDigest } from '../modules/admin-orders/service.js'

/**
 * Encomenda paga tem prazo de produção prometido ao cliente. Uma vez por dia
 * útil, a partir das 8h, a equipe recebe o que já atrasou e o que vence até o
 * próximo dia útil — antes de o cliente perguntar.
 *
 * Roda de hora em hora, mas a hora e o "uma vez por dia" são decididos dentro
 * (`sendProductionDigest`): um restart do worker às 8h30 não repete o resumo.
 */
export const checkProductionDeadlines = async (): Promise<void> => {
  await sendProductionDigest()
}
