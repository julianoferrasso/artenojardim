import { env } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'

/**
 * O ÚNICO ponto do código que sabe qual é a loja.
 *
 * Hoje: lê STORE_ID do .env, valida uma vez no boot, guarda em memória.
 * Sem middleware, sem AsyncLocalStorage, sem injeção. É só isso.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Fase 4 (multi-tenant): esta função passa a ler de um AsyncLocalStorage
 * populado por um middleware que resolve o tenant pelo Host. NADA MAIS MUDA —
 * as queries já filtram por storeId e os índices já são compostos [storeId, ...].
 *
 * É por isso que o storeId existe desde o dia um numa loja só: adicioná-lo depois
 * não é a migração de schema (fácil), é revisar cada query do sistema para
 * garantir que filtra pelo tenant. Uma esquecida vaza dados entre lojas, e é
 * impossível de detectar em dev, onde só existe um tenant.
 * ────────────────────────────────────────────────────────────────────────────
 */

let cachedStoreId: string | undefined

/**
 * Chamado uma vez no boot (server.ts). Falha aqui é falha de subir — melhor que
 * descobrir na primeira requisição que STORE_ID aponta para uma loja inexistente.
 */
export const initStoreContext = async (): Promise<string> => {
  const store = await prisma.store.findUnique({
    where: { id: env.STORE_ID },
    select: { id: true, name: true, domain: true },
  })

  if (!store) {
    throw new Error(
      `STORE_ID="${env.STORE_ID}" não existe no banco. Rode \`pnpm db:seed\` e copie o id impresso para o .env.`,
    )
  }

  cachedStoreId = store.id
  logger.info({ storeId: store.id, name: store.name, domain: store.domain }, 'loja ativa')
  return store.id
}

export const getActiveStoreId = (): string => {
  if (!cachedStoreId) {
    throw new Error('store-context não inicializado — initStoreContext() deve rodar no boot')
  }
  return cachedStoreId
}
