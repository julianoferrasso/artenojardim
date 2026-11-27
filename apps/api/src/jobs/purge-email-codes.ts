import { logger } from '../config/logger.js'
import { purgeStaleEmailCodes } from '../modules/customer-auth/service.js'

/**
 * Códigos de acesso por e-mail com mais de um dia. Nenhum ainda vale (vencem em
 * 10 min), e a linha guarda o e-mail de quem pediu — inclusive de quem nunca
 * virou cliente. Dado pessoal sem finalidade não fica no banco (LGPD).
 */
export const purgeEmailCodes = async (): Promise<void> => {
  const removed = await purgeStaleEmailCodes()
  if (removed > 0) logger.info({ removed }, 'códigos de acesso antigos apagados')
}
