import type { Request, Response } from 'express'
import { ok } from '../../shared/http.js'
import * as service from './service.js'

export const getPublicStoreController = async (_req: Request, res: Response): Promise<void> => {
  const store = await service.getPublicStore()
  ok(res, store)
}
