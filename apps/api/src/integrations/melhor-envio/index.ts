/**
 * Fachada da integração com o Melhor Envio. O módulo shipping importa daqui —
 * não dos arquivos internos — para que a organização interna (oauth, token,
 * client, quote) possa mudar sem tocar em quem usa.
 */
export { buildAuthorizeUrl } from './oauth.js'
export { completeAuthorization, isConnected, savePendingState, getValidAccessToken } from './token.js'
export { calculateShipping, type MeProduct, type MeCalculateOption } from './quote.js'
