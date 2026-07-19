import type { Request, Response } from 'express'
import type { RecordMovementInput } from '@ecommerce/shared/contracts'
import { ok, created, paginated } from '../../shared/http.js'
import * as service from './service.js'

const auditContext = (req: Request) => ({
  userId: req.auth?.sub,
  ip: req.ip,
  userAgent: req.get('user-agent'),
})

export const recordMovementController = async (req: Request, res: Response): Promise<void> => {
  created(res, await service.recordMovement(req.body as RecordMovementInput, auditContext(req)))
}

export const levelController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.getLevel(req.params['variantId'] as string))
}

export const ledgerController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.getVariantLedger(req.params['variantId'] as string))
}

export const listStockController = async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query['page'] ?? 1)
  const perPage = Math.min(Number(req.query['perPage'] ?? 50), 100)
  const lowStock = req.query['lowStock'] === 'true'
  const { items, meta } = await service.listStock({ page, perPage, lowStock })
  paginated(res, items, meta)
}

export const reconcileController = async (_req: Request, res: Response): Promise<void> => {
  ok(res, await service.reconcile())
}
