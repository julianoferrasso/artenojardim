import type { Request, Response } from 'express'
import type {
  SupportReplyData,
  SupportStatusInput,
  SupportThreadListQuery,
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
  const { items, meta } = await service.listThreads(req.query as unknown as SupportThreadListQuery)
  paginated(res, items, meta)
}

export const detailController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.getThread(id(req)))
}

export const replyController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.replyToThread(id(req), req.body as SupportReplyData, auditContext(req)))
}

export const statusController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.setThreadStatus(id(req), req.body as SupportStatusInput, auditContext(req)))
}

export const summaryController = async (_req: Request, res: Response): Promise<void> => {
  ok(res, await service.getSummary())
}
