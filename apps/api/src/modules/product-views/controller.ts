import type { Request, Response } from 'express'
import type { TrackProductViewInput } from '@ecommerce/shared/contracts'
import { noContent } from '../../shared/http.js'
import * as service from './service.js'

export const trackController = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as TrackProductViewInput
  await service.trackProductView(body.slug)
  // 204: fire-and-forget. A loja não espera corpo nem age no resultado.
  noContent(res)
}
