import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { createLocalStorage } from './local.js'
import { createR2Storage } from './r2.js'
import type { StorageProvider } from './types.js'

export type { StorageProvider, UploadTarget } from './types.js'
export { verifyLocalUploadToken, writeLocalFile } from './local.js'

/**
 * O registry inteiro. Um objeto literal é uma factory — só que legível.
 * Sem plugin loader, sem classe abstrata, sem tabela de configuração.
 */
const drivers: Record<StorageProvider['id'], () => StorageProvider> = {
  local: createLocalStorage,
  r2: createR2Storage,
}

let instance: StorageProvider | undefined

export const storage = (): StorageProvider => {
  if (!instance) {
    instance = drivers[env.STORAGE_DRIVER]()

    if (env.STORAGE_DRIVER === 'local' && env.NODE_ENV === 'production') {
      logger.warn(
        'STORAGE_DRIVER=local em produção: sem backup junto do pg_dump, sem CDN, e a mídia fica presa no disco desta VPS. Use r2.',
      )
    }
  }
  return instance
}

/**
 * Caminho previsível e particionado por data — evita um diretório com 100k
 * arquivos e torna óbvio o que apagar ao remover uma loja (Fase 4).
 * O nome original vira só metadado: nome de arquivo do usuário em caminho de
 * storage é colisão e path traversal esperando acontecer.
 */
export const buildUploadKey = (params: {
  storeId: string
  folder: string
  filename: string
}): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const ext = extname(params.filename).toLowerCase() || '.bin'

  return `store/${params.storeId}/${params.folder}/${year}/${month}/${randomUUID()}${ext}`
}
