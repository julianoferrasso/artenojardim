/**
 * Fachada da integração com o Mercado Pago (Checkout Transparente, Orders API).
 * O módulo de pagamentos importa daqui, nunca dos arquivos internos.
 */
export { isMercadoPagoConfigured, getMpPublicKey } from './client.js'
export {
  createPixOrder,
  createCardOrder,
  getMpOrder,
  cancelMpOrder,
  refundMpOrder,
  type MpOrderSnapshot,
  type MpPixData,
  type MpPayer,
  type MpItem,
  type CreateCardInput,
} from './orders.js'
export { verifyMpSignature } from './webhook.js'
export { centsToMp, mpToCents } from './money.js'
