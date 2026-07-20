import type { Request, Response } from 'express'
import type {
  Actor,
  CreateStaffUserInput,
  UpdateStaffUserInput,
  ResetStaffPasswordInput,
  StaffUserListQuery,
} from '@ecommerce/shared/contracts'
import { ok, created, noContent, paginated } from '../../shared/http.js'
import { buildMeta } from '../../shared/pagination.js'
import * as service from './service.js'

const auditContext = (req: Request) => ({
  userId: req.auth?.sub,
  ip: req.ip,
  userAgent: req.get('user-agent'),
})

/**
 * Quem está agindo. O router já garantiu `type: 'user'` (authenticate +
 * requireStaff), então o cast é seguro — e o service precisa do par id+role
 * para decidir quem pode mexer em quem.
 */
const actor = (req: Request): Actor => ({
  id: req.auth!.sub,
  role: (req.auth as { role: Actor['role'] }).role,
})

export const listController = async (req: Request, res: Response): Promise<void> => {
  const query = req.query as unknown as StaffUserListQuery
  const { items, total } = await service.listStaffUsers(query)
  paginated(res, items, buildMeta(query, total))
}

export const detailController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.getStaffUser(req.params['id'] as string))
}

export const createController = async (req: Request, res: Response): Promise<void> => {
  const user = await service.createStaffUser(
    actor(req),
    req.body as CreateStaffUserInput,
    auditContext(req),
  )
  created(res, user)
}

export const updateController = async (req: Request, res: Response): Promise<void> => {
  const user = await service.updateStaffUser(
    actor(req),
    req.params['id'] as string,
    req.body as UpdateStaffUserInput,
    auditContext(req),
  )
  ok(res, user)
}

export const deactivateController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.deactivateStaffUser(actor(req), req.params['id'] as string, auditContext(req)))
}

export const reactivateController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.reactivateStaffUser(actor(req), req.params['id'] as string, auditContext(req)))
}

export const resetPasswordController = async (req: Request, res: Response): Promise<void> => {
  await service.resetStaffPassword(
    actor(req),
    req.params['id'] as string,
    req.body as ResetStaffPasswordInput,
    auditContext(req),
  )
  noContent(res)
}
