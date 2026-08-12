import type { Request, Response } from 'express'
import type { PaginationQuery, SendProductCampaignInput } from '@ecommerce/shared/contracts'
import { accepted, ok, paginated } from '../../shared/http.js'
import * as service from './service.js'

export const previewController = async (req: Request, res: Response): Promise<void> => {
  const query = req.query as unknown as PaginationQuery
  ok(res, await service.previewRecipients(query))
}

export const sendController = async (req: Request, res: Response): Promise<void> => {
  const campaign = await service.sendProductCampaign(
    req.params['productId'] as string,
    req.body as SendProductCampaignInput,
    {
      userId: req.auth?.sub,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    },
  )

  // 202 e não 201: a campanha existe, mas nenhum e-mail saiu ainda — eles saem
  // pela fila. Responder 201 diria ao lojista que o envio terminou.
  accepted(res, campaign)
}

export const listController = async (req: Request, res: Response): Promise<void> => {
  const query = req.query as unknown as PaginationQuery
  const { items, meta } = await service.listCampaigns(query)
  paginated(res, items, meta)
}
