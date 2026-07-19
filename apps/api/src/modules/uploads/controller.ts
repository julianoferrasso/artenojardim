import type { Request, Response } from 'express'
import type { PresignUploadInput, ConfirmUploadInput } from '@ecommerce/shared/contracts'
import { ok, created, noContent, paginated } from '../../shared/http.js'
import { appError } from '../../shared/errors.js'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { env } from '../../config/env.js'
import { toPrismaPagination, buildMeta } from '../../shared/pagination.js'
import { verifyLocalUploadToken, writeLocalFile } from '../../integrations/storage/index.js'
import type { ListUploadsQuery } from './schemas.js'
import * as service from './service.js'

export const presignController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.presignUpload(req.body as PresignUploadInput))
}

export const listController = async (req: Request, res: Response): Promise<void> => {
  const query = req.query as unknown as ListUploadsQuery
  const { items, total } = await service.listUploads({
    ...(query.folder ? { folder: query.folder } : {}),
    ...toPrismaPagination(query),
  })
  paginated(res, items, buildMeta(query, total))
}

export const confirmController = async (req: Request, res: Response): Promise<void> => {
  const upload = await service.confirmUpload(req.body as ConfirmUploadInput, req.auth!.sub)
  created(res, upload)
}

export const deleteController = async (req: Request, res: Response): Promise<void> => {
  await service.deleteUpload(req.params['id'] as string)
  noContent(res)
}

/**
 * Recebe o PUT do browser — SÓ no driver local (desenvolvimento).
 *
 * Em produção o R2 recebe o PUT direto e esta rota nem é montada. Ela existe para
 * que o código do FRONT seja idêntico nos dois ambientes: ele pede uma URL e faz
 * PUT nela, sem saber quem responde do outro lado.
 *
 * A autorização aqui é o token assinado na query, não o JWT: o browser não manda
 * Authorization num PUT direto de arquivo. O token é o que impede alguém de
 * escrever em qualquer caminho — espelha o papel da assinatura na URL do R2.
 */
export const directUploadController = async (req: Request, res: Response): Promise<void> => {
  if (env.STORAGE_DRIVER !== 'local') {
    throw appError(ERROR_CODES.NOT_FOUND, 'Rota indisponível', 404)
  }

  const key = req.query['key'] as string | undefined
  const expiresAt = Number(req.query['expiresAt'])
  const token = req.query['token'] as string | undefined

  if (!key || !token || !Number.isFinite(expiresAt)) {
    throw appError(ERROR_CODES.VALIDATION_ERROR, 'Parâmetros de upload ausentes', 400)
  }

  // Lança AppError se o token não bater ou tiver expirado.
  verifyLocalUploadToken(key, expiresAt, token)

  // express.raw() no router entrega o corpo como Buffer.
  const body = req.body as Buffer
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw appError(ERROR_CODES.VALIDATION_ERROR, 'Corpo do upload vazio', 400)
  }

  await writeLocalFile(key, body)
  ok(res, { key, size: body.length })
}
