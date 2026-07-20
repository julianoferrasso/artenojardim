import type { Request, Response } from 'express'
import type {
  AdminOrderListQuery,
  UpdateFulfillmentInput,
  CancelOrderInput,
  RefundOrderInput,
  InternalNoteInput,
  AddOrderEventInput,
} from '@ecommerce/shared/contracts'
import { ok, paginated } from '../../shared/http.js'
import * as service from './service.js'

const auditContext = (req: Request) => ({
  userId: req.auth?.sub,
  ip: req.ip,
  userAgent: req.get('user-agent'),
})

const id = (req: Request): string => req.params['id'] as string

export const listController = async (req: Request, res: Response): Promise<void> => {
  const query = req.query as unknown as AdminOrderListQuery
  const { items, meta } = await service.listOrders(query)
  paginated(res, items, meta)
}

export const detailController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.getOrder(id(req)))
}

export const fulfillmentController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.updateFulfillment(id(req), req.body as UpdateFulfillmentInput, auditContext(req)))
}

export const cancelController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.cancelOrder(id(req), req.body as CancelOrderInput, auditContext(req)))
}

export const refundController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.refundOrder(id(req), req.body as RefundOrderInput, auditContext(req)))
}

export const noteController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.setInternalNote(id(req), req.body as InternalNoteInput, auditContext(req)))
}

export const addEventController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.addOrderEvent(id(req), req.body as AddOrderEventInput, auditContext(req)))
}
