import { logger } from '../config/logger.js'
import { expireUnpaidOrders } from '../modules/orders/service.js'

/**
 * Pedido não pago não segura a peça para sempre. Vencida a reserva — o prazo do
 * Pix, ou a janela padrão de quem nem chegou a pagar —, o pedido é cancelado e a
 * peça volta à vitrine. Antes deste job, um checkout abandonado deixava o
 * produto "esgotado" até alguém cancelar o pedido à mão.
 */
export const releaseExpiredReservations = async (): Promise<void> => {
  const { canceled, skipped } = await expireUnpaidOrders()
  // Os que esperam (cartão em análise, Pix vigente) voltam a cada rodada: logar
  // só quando algo foi cancelado evita uma linha a cada 5 minutos.
  if (canceled > 0) logger.info({ canceled, skipped }, 'pedidos não pagos cancelados por reserva vencida')
}
