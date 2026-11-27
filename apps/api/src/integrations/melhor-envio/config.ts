import type { MeEnvironment } from '@ecommerce/shared/contracts'
import { env } from '../../config/env.js'
import { getSetting } from '../../shared/settings.js'

/**
 * Configuração do aplicativo do Melhor Envio, lida do Setting `melhor_envio_app`
 * (editado em /frete no admin). Lida a cada chamada: o worker renova o token com
 * o segredo daqui, e um segredo trocado no painel tem que valer sem restart.
 */

const BASE_URLS: Record<MeEnvironment, string> = {
  production: 'https://melhorenvio.com.br',
  sandbox: 'https://sandbox.melhorenvio.com.br',
}

/** O ME exige e-mail de contato no User-Agent; sem ele, 403. */
const FALLBACK_CONTACT_EMAIL = 'contato@artenojardim.com.br'

/**
 * Onde o ME devolve o lojista após o consentimento: a página /melhorenvio da
 * loja, que repassa o código à API. Tem que bater, caractere por caractere, com
 * o "URL de redirecionamento" cadastrado no app do painel deles.
 */
export const meRedirectUri = (): string => new URL('/melhorenvio', env.STORE_URL).toString()

export type MeAppConfig = {
  baseUrl: string
  clientId: string | null
  clientSecret: string | null
  userAgent: string
}

export const getMeAppConfig = async (): Promise<MeAppConfig> => {
  const s = await getSetting('melhor_envio_app')
  return {
    baseUrl: BASE_URLS[s.environment],
    clientId: s.clientId,
    clientSecret: s.clientSecret,
    userAgent: `Arte no Jardim (${s.contactEmail ?? FALLBACK_CONTACT_EMAIL})`,
  }
}
