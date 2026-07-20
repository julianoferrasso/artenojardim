import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'

/**
 * Upsert idempotente por (loja, e-mail): inscrever de novo não duplica, e quem
 * havia saído volta a receber (zera `unsubscribedAt`). O e-mail já chega
 * normalizado (trim + lowercase) pelo schema do contrato.
 */
export const subscribe = async (email: string): Promise<void> => {
  const storeId = getActiveStoreId()

  await prisma.newsletterSubscriber.upsert({
    where: { storeId_email: { storeId, email } },
    create: { storeId, email },
    update: { unsubscribedAt: null },
  })
}
