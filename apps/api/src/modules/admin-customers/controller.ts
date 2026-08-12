import type { Request, Response } from 'express'
import type {
  AdminCustomerListQuery,
  UpdateAdminCustomerInput,
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
  const query = req.query as unknown as AdminCustomerListQuery
  const { items, meta } = await service.listCustomers(query)
  paginated(res, items, meta)
}

export const detailController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.getCustomer(id(req)))
}

export const updateController = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as UpdateAdminCustomerInput
  ok(res, await service.updateCustomer(id(req), input, auditContext(req)))
}

export const anonymizeController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.anonymizeCustomer(id(req), auditContext(req)))
}
