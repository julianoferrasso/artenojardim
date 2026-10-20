import type { Request, Response } from 'express'
import type { CreateStockNotificationInput } from '@ecommerce/shared/contracts'
import { noContent } from '../../shared/http.js'
import * as service from './service.js'

export const createController = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as CreateStockNotificationInput
  await service.requestStockNotification(body.variantId, body.email)
  // 204 sempre, como no newsletter: confirmar algo aqui diria se o e-mail já
  // estava inscrito, ou se a variação existe.
  noContent(res)
}
