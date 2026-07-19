import { Router, raw } from 'express'
import {
  presignUploadSchema,
  confirmUploadSchema,
  MAX_UPLOAD_BYTES,
} from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate, requireStaff } from '../../middlewares/authenticate.js'
import { listUploadsQuerySchema } from './schemas.js'
import * as controller from './controller.js'

export const uploadRoutes: Router = Router()

uploadRoutes.get(
  '/',
  authenticate,
  requireStaff,
  validate({ query: listUploadsQuerySchema }),
  controller.listController,
)

// presign e confirm exigem staff logado: só o painel gera upload.
uploadRoutes.post(
  '/presign',
  authenticate,
  requireStaff,
  validate({ body: presignUploadSchema }),
  controller.presignController,
)

uploadRoutes.post(
  '/confirm',
  authenticate,
  requireStaff,
  validate({ body: confirmUploadSchema }),
  controller.confirmController,
)

uploadRoutes.delete('/:id', authenticate, requireStaff, controller.deleteController)

/**
 * /direct — recebe o PUT do browser no driver local. SEM authenticate: o browser
 * não manda Authorization num PUT direto; a autorização é o token assinado na
 * query, validado no controller.
 *
 * raw() com os mesmos limites do contrato: o Express bufferiza o corpo, e sem
 * teto um PUT gigante viraria pressão de memória. `type: () => true` aceita
 * qualquer Content-Type, porque o browser manda o da imagem, não JSON.
 */
uploadRoutes.put(
  '/direct',
  raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  controller.directUploadController,
)
