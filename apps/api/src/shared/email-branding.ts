import { prisma } from '../config/prisma.js'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { getSetting } from './settings.js'
import { getActiveStoreId } from './store-context.js'
import { resolveLogoUrl } from '../modules/store/service.js'
import type { EmailBranding } from '../integrations/email/index.js'

/**
 * Nome e logo da loja para o cabeçalho dos e-mails.
 *
 * Mora aqui e não em `integrations/email/` de propósito: a integração fala com o
 * mundo lá fora e não conhece o nosso banco. O service busca a marca e entrega
 * pronta ao template — assim `integrations/` nunca importa Prisma.
 */

/** Cache curto: um envio não precisa de duas queries, e o lojista troca o logo raramente. */
const CACHE_TTL_MS = 5 * 60_000

let cached: { value: EmailBranding; at: number } | undefined

export const getEmailBranding = async (): Promise<EmailBranding> => {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value

  const storeUrl = env.STORE_URL.replace(/\/$/, '')

  try {
    const [store, theme] = await Promise.all([
      prisma.store.findUniqueOrThrow({
        where: { id: getActiveStoreId() },
        select: { name: true },
      }),
      getSetting('theme'),
    ])

    const value: EmailBranding = {
      storeName: store.name,
      storeUrl,
      logoUrl: await resolveLogoUrl(theme.logoId),
    }

    cached = { value, at: Date.now() }
    return value
  } catch (err) {
    // Marca é enfeite: um e-mail de recuperação de senha sem logo ainda recupera
    // a senha. Falhar aqui seria trocar um problema estético por um funcional.
    logger.warn({ err }, 'não foi possível carregar a marca para o e-mail — seguindo sem logo')
    return { storeName: env.EMAIL_FROM_NAME, storeUrl, logoUrl: null }
  }
}
