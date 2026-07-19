import type { ShippingProvider } from '../types.js'
import { melhorEnvioProvider } from './melhor-envio.js'

/**
 * Registry de transportadoras. Um Record é uma factory — só que legível: sem
 * plugin loader, sem classe abstrata, sem tabela. Adicionar Jadlog/Correios é
 * criar o provider e registrar aqui; checkout e orders não mudam.
 */
export const shippingProviders = {
  'melhor-envio': melhorEnvioProvider,
} satisfies Record<string, ShippingProvider>

/** Provider ativo na v1. Vira Setting quando houver mais de um. */
export const activeProvider: ShippingProvider = melhorEnvioProvider
