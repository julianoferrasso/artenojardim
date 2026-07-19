import type { Request, Response } from 'express'
import type {
  CreateProductInput,
  UpdateProductInput,
  ProductListQuery,
} from '@ecommerce/shared/contracts'
import { ok, created, noContent, paginated } from '../../shared/http.js'
import * as service from './service.js'

const auditContext = (req: Request) => ({
  userId: req.auth?.sub,
  ip: req.ip,
  userAgent: req.get('user-agent'),
})

/** Lista pública (loja): só ACTIVE. `req.auth` ausente ⇒ publicOnly. */
export const listController = async (req: Request, res: Response): Promise<void> => {
  const query = req.query as unknown as ProductListQuery
  const { items, meta } = await service.listProducts(query, { publicOnly: !req.auth })
  paginated(res, items, meta)
}

export const detailController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.getProduct(req.params['idOrSlug'] as string, { publicOnly: !req.auth }))
}

export const createController = async (req: Request, res: Response): Promise<void> => {
  created(res, await service.createProduct(req.body as CreateProductInput, auditContext(req)))
}

export const updateController = async (req: Request, res: Response): Promise<void> => {
  ok(
    res,
    await service.updateProduct(req.params['id'] as string, req.body as UpdateProductInput, auditContext(req)),
  )
}

export const deleteController = async (req: Request, res: Response): Promise<void> => {
  await service.deleteProduct(req.params['id'] as string, auditContext(req))
  noContent(res)
}
