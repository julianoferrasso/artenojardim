import type { Request, Response } from 'express'
import type {
  CreateCouponInput,
  UpdateCouponInput,
  ValidateCouponInput,
} from '@ecommerce/shared/contracts'
import { ok, created, noContent } from '../../shared/http.js'
import * as service from './service.js'

const auditContext = (req: Request) => ({
  userId: req.auth?.sub,
  ip: req.ip,
  userAgent: req.get('user-agent'),
})

export const listController = async (_req: Request, res: Response): Promise<void> => {
  ok(res, await service.listCoupons())
}

export const createController = async (req: Request, res: Response): Promise<void> => {
  created(res, await service.createCoupon(req.body as CreateCouponInput, auditContext(req)))
}

export const updateController = async (req: Request, res: Response): Promise<void> => {
  ok(
    res,
    await service.updateCoupon(
      req.params['id'] as string,
      req.body as UpdateCouponInput,
      auditContext(req),
    ),
  )
}

export const deleteController = async (req: Request, res: Response): Promise<void> => {
  await service.deleteCoupon(req.params['id'] as string, auditContext(req))
  noContent(res)
}

/** `authenticateCustomer` no router garante o `sub`. */
export const validateController = async (req: Request, res: Response): Promise<void> => {
  const { code } = req.body as ValidateCouponInput
  ok(res, await service.validateCouponForCart(req.auth!.sub, code))
}
