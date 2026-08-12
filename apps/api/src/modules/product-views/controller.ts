import type { Request, Response } from 'express'
import type { TrackProductViewInput } from '@ecommerce/shared/contracts'
import { noContent } from '../../shared/http.js'
import * as service from './service.js'

export const trackController = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as TrackProductViewInput

  // `type === 'customer'` é redundante depois do optionalAuthenticateCustomer
  // (ele já filtra), mas documenta a intenção: staff logado na mesma máquina não
  // deve virar "cliente que visualizou".
  const customerId = req.auth?.type === 'customer' ? req.auth.sub : undefined

  await service.trackProductView(body.slug, customerId)
  // 204: fire-and-forget. A loja não espera corpo nem age no resultado.
  noContent(res)
}
