import type { PublicStore } from '@ecommerce/shared/contracts'
import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { getFlags } from '../../shared/flags.js'

/**
 * Projeção PÚBLICA da Store: nada de `id`, `document` ou endereço — é resposta
 * cacheável que qualquer visitante anônimo lê.
 */
export const getPublicStore = async (): Promise<PublicStore> => {
  const [store, flags] = await Promise.all([
    prisma.store.findUniqueOrThrow({
      where: { id: getActiveStoreId() },
      select: {
        name: true,
        email: true,
        phone: true,
        currency: true,
        locale: true,
        timezone: true,
      },
    }),
    getFlags(),
  ])

  return { ...store, flags }
}
