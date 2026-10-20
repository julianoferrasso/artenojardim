import type { Request, Response } from 'express'
import type { TrackVisitInput } from '@ecommerce/shared/contracts'
import { noContent } from '../../shared/http.js'
import * as service from './service.js'

export const trackController = async (req: Request, res: Response): Promise<void> => {
  await service.trackVisit(req.body as TrackVisitInput, req.get('user-agent') ?? '')
  // 204: fire-and-forget. A loja não espera corpo nem age no resultado.
  noContent(res)
}
