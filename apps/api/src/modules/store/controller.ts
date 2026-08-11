import type { Request, Response } from 'express'
import type { UpdateStoreThemeInput } from '@ecommerce/shared/contracts'
import { ok } from '../../shared/http.js'
import * as service from './service.js'

const auditContext = (req: Request) => ({
  userId: req.auth?.sub,
  ip: req.ip,
  userAgent: req.get('user-agent'),
})

export const getPublicStoreController = async (_req: Request, res: Response): Promise<void> => {
  const store = await service.getPublicStore()
  ok(res, store)
}

export const getThemeController = async (_req: Request, res: Response): Promise<void> => {
  const theme = await service.getAdminTheme()
  ok(res, theme)
}

export const updateThemeController = async (req: Request, res: Response): Promise<void> => {
  const theme = await service.updateTheme(req.body as UpdateStoreThemeInput, auditContext(req))
  ok(res, theme)
}
