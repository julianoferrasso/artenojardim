import type { Request, Response } from 'express'
import type {
  CreateInstagramPostInput,
  ReorderInstagramPostsInput,
  UpdateInstagramPostInput,
} from '@ecommerce/shared/contracts'
import { ok, created, noContent } from '../../shared/http.js'
import * as service from './service.js'

const auditContext = (req: Request) => ({
  userId: req.auth?.sub,
  ip: req.ip,
  userAgent: req.get('user-agent'),
})

/** Anônimo recebe a projeção pública; staff vê tudo. */
export const listController = async (req: Request, res: Response): Promise<void> => {
  ok(res, req.auth ? await service.listInstagramPosts() : await service.listPublicInstagramPosts())
}

export const createController = async (req: Request, res: Response): Promise<void> => {
  created(
    res,
    await service.createInstagramPost(req.body as CreateInstagramPostInput, auditContext(req)),
  )
}

export const updateController = async (req: Request, res: Response): Promise<void> => {
  ok(
    res,
    await service.updateInstagramPost(
      req.params['id'] as string,
      req.body as UpdateInstagramPostInput,
      auditContext(req),
    ),
  )
}

export const reorderController = async (req: Request, res: Response): Promise<void> => {
  const { ids } = req.body as ReorderInstagramPostsInput
  ok(res, await service.reorderInstagramPosts(ids, auditContext(req)))
}

export const deleteController = async (req: Request, res: Response): Promise<void> => {
  await service.deleteInstagramPost(req.params['id'] as string, auditContext(req))
  noContent(res)
}
