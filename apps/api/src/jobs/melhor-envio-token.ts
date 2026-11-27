import { logger } from '../config/logger.js'
import { renewProviderToken } from '../modules/shipping/service.js'
import { notifyShippingDisconnected, notifyShippingRenewalBlocked } from '../modules/notifications/service.js'

/**
 * Mantém a conexão do Melhor Envio viva sem depender de cliente cotando. Os
 * avisos se repetem a cada execução de propósito: frete fora do ar é loja sem
 * venda — no log e no alerta da equipe, até alguém resolver.
 */
export const renewMelhorEnvioToken = async (): Promise<void> => {
  const { status, blockedBy } = await renewProviderToken()

  if (!status.connected) {
    logger.warn('Melhor Envio não conectado: frete fora do ar até reconectar em /frete no admin')
    await notifyShippingDisconnected()
    return
  }

  // Conectado, mas a renovação esbarrou na credencial do app: avisa agora,
  // enquanto o token ainda vale, e não quando o frete já caiu.
  if (blockedBy) {
    await notifyShippingRenewalBlocked({ problem: blockedBy, expiresAt: status.expiresAt })
    return
  }

  logger.info({ expiresAt: status.expiresAt }, 'Melhor Envio: token válido')
}
