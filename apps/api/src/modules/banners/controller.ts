import type { Request, Response } from 'express'
import type { CreateBannerInput, UpdateBannerInput } from '@ecommerce/shared/contracts'
import { ok, created, noContent } from '../../shared/http.js'
import * as service from './service.js'

const auditContext = (req: Request) => ({
  userId: req.auth?.sub,
  ip: req.ip,
  userAgent: req.get('user-agent'),
})

/** Anônimo recebe só os ativos, na projeção pública; staff vê tudo. */
export const listController = async (req: Request, res: Response): Promise<void> => {
  ok(res, req.auth ? await service.listBanners() : await service.listPublicBanners())
}

export const createController = async (req: Request, res: Response): Promise<void> => {
  created(res, await service.createBanner(req.body as CreateBannerInput, auditContext(req)))
}

export const updateController = async (req: Request, res: Response): Promise<void> => {
  ok(
    res,
    await service.updateBanner(
      req.params['id'] as string,
      req.body as UpdateBannerInput,
      auditContext(req),
    ),
  )
}

export const deleteController = async (req: Request, res: Response): Promise<void> => {
  await service.deleteBanner(req.params['id'] as string, auditContext(req))
  noContent(res)
}
