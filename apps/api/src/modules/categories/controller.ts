import type { Request, Response } from 'express'
import type { CreateCategoryInput, UpdateCategoryInput } from '@ecommerce/shared/contracts'
import { ok, created, noContent } from '../../shared/http.js'
import * as service from './service.js'

const auditContext = (req: Request) => ({
  userId: req.auth?.sub,
  ip: req.ip,
  userAgent: req.get('user-agent'),
})

export const treeController = async (_req: Request, res: Response): Promise<void> => {
  ok(res, await service.getCategoryTree())
}

export const listController = async (_req: Request, res: Response): Promise<void> => {
  ok(res, await service.listCategories())
}

export const detailController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.getCategory(req.params['id'] as string))
}

export const createController = async (req: Request, res: Response): Promise<void> => {
  const category = await service.createCategory(req.body as CreateCategoryInput, auditContext(req))
  created(res, category)
}

export const updateController = async (req: Request, res: Response): Promise<void> => {
  const category = await service.updateCategory(
    req.params['id'] as string,
    req.body as UpdateCategoryInput,
    auditContext(req),
  )
  ok(res, category)
}

export const deleteController = async (req: Request, res: Response): Promise<void> => {
  await service.deleteCategory(req.params['id'] as string, auditContext(req))
  noContent(res)
}
