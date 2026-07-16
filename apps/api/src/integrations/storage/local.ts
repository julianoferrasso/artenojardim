import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, unlink, access, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { env } from '../../config/env.js'
import { appError } from '../../shared/errors.js'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import type { StorageProvider, UploadTarget } from './types.js'

/**
 * Driver de DESENVOLVIMENTO: grava em ./uploads, sem credencial de nuvem nenhuma.
 *
 * Devolve uma URL apontando para a própria API em vez de para um bucket. O
 * resultado é que o código do FRONT é idêntico nos dois drivers — ele pede uma
 * URL e faz PUT nela, sem saber quem responde do outro lado.
 *
 * NÃO use em produção: sem backup junto do pg_dump, sem CDN, e a mídia fica presa
 * no disco de uma VPS.
 */

const uploadDir = resolve(process.cwd(), env.LOCAL_UPLOAD_DIR)

/**
 * O PUT local é aberto (o browser não manda Authorization num PUT direto), então
 * o token assinado é o que impede alguém de escrever qualquer arquivo em qualquer
 * caminho. Espelha o papel da assinatura na URL do R2.
 */
const signKey = (key: string, expiresAt: number): string =>
  createHmac('sha256', env.JWT_ACCESS_SECRET).update(`${key}:${expiresAt}`).digest('hex')

export const verifyLocalUploadToken = (key: string, expiresAt: number, token: string): void => {
  if (Date.now() > expiresAt) {
    throw appError(ERROR_CODES.UNAUTHORIZED, 'URL de upload expirada', 401)
  }

  const expected = signKey(key, expiresAt)
  const a = Buffer.from(expected)
  const b = Buffer.from(token)

  // timingSafeEqual exige mesmo tamanho e não vaza o ponto da divergência.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw appError(ERROR_CODES.UNAUTHORIZED, 'Token de upload inválido', 401)
  }
}

/**
 * A key vem do servidor, mas escrever no disco a partir dela sem checar é um
 * path traversal esperando acontecer (`../../.env`). Resolve e confirma que o
 * destino ficou dentro de uploadDir.
 */
const safePath = (key: string): string => {
  const target = resolve(uploadDir, key)
  if (target !== uploadDir && !target.startsWith(uploadDir + sep)) {
    throw appError(ERROR_CODES.VALIDATION_ERROR, 'Caminho de arquivo inválido', 400)
  }
  return target
}

export const writeLocalFile = async (key: string, body: Buffer): Promise<void> => {
  const target = safePath(key)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, body)
}

export const createLocalStorage = (): StorageProvider => ({
  id: 'local',

  getUploadUrl: async (key: string, mimeType: string): Promise<UploadTarget> => {
    const expiresAt = Date.now() + 5 * 60 * 1000
    const token = signKey(key, expiresAt)
    const params = new URLSearchParams({ key, expiresAt: String(expiresAt), token })

    return {
      uploadUrl: `${env.API_URL}/api/v1/uploads/direct?${params}`,
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      key,
    }
  },

  getPublicUrl: (key: string): string => `${env.API_URL}/uploads/${key}`,

  delete: async (key: string): Promise<void> => {
    try {
      await unlink(safePath(key))
    } catch (err) {
      // Apagar o que já não existe é sucesso: delete precisa ser idempotente.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  },

  exists: async (key: string): Promise<boolean> => {
    try {
      await access(join(uploadDir, key))
      return true
    } catch {
      return false
    }
  },
})
