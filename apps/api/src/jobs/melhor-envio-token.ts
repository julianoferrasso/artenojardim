import { logger } from '../config/logger.js'
import { renewProviderToken } from '../modules/shipping/service.js'

/**
 * Mantém a conexão do Melhor Envio viva sem depender de cliente cotando. O
 * aviso de "não conectado" se repete a cada execução de propósito: frete fora
 * do ar é loja sem venda, e o log é o único lugar onde isso aparece sozinho.
 */
export const renewMelhorEnvioToken = async (): Promise<void> => {
  const status = await renewProviderToken()

  if (!status.connected) {
    logger.warn('Melhor Envio não conectado: frete fora do ar até reconectar em /frete no admin')
    return
  }

  logger.info({ expiresAt: status.expiresAt }, 'Melhor Envio: token válido')
}
