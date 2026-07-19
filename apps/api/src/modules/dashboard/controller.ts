import type { Request, Response } from 'express'
import type { DashboardQuery } from '@ecommerce/shared/contracts'
import { ok } from '../../shared/http.js'
import * as service from './service.js'

export const overviewController = async (req: Request, res: Response): Promise<void> => {
  const query = req.query as unknown as DashboardQuery
  ok(res, await service.getOverview(query))
}
