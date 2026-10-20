import type { Request, Response } from 'express'
import type {
  AlertSettings,
  CreateAlertDestinationData,
  UpdateAlertDestinationData,
  VerifyAlertCodeInput,
} from '@ecommerce/shared/contracts'
import { ok, created, noContent } from '../../shared/http.js'
import * as service from './service.js'

const auditContext = (req: Request) => ({
  userId: req.auth?.sub,
  ip: req.ip,
  userAgent: req.get('user-agent'),
})

const idOf = (req: Request): string => req.params['id'] as string

export const overviewController = async (_req: Request, res: Response): Promise<void> => {
  ok(res, await service.getAlertsOverview())
}

export const historyController = async (_req: Request, res: Response): Promise<void> => {
  ok(res, await service.listAlertHistory())
}

export const updateSettingsController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.updateAlertSettings(req.body as AlertSettings, auditContext(req)))
}

export const createDestinationController = async (req: Request, res: Response): Promise<void> => {
  created(res, await service.createDestination(req.body as CreateAlertDestinationData, auditContext(req)))
}

export const updateDestinationController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.updateDestination(idOf(req), req.body as UpdateAlertDestinationData, auditContext(req)))
}

export const deleteDestinationController = async (req: Request, res: Response): Promise<void> => {
  await service.deleteDestination(idOf(req), auditContext(req))
  noContent(res)
}

export const resendController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.resendCode(idOf(req)))
}

export const verifyController = async (req: Request, res: Response): Promise<void> => {
  const { code } = req.body as VerifyAlertCodeInput
  ok(res, await service.verifyCode(idOf(req), code, auditContext(req)))
}

export const telegramSyncController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.syncTelegramLink(idOf(req)))
}

export const testController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.sendTestAlert(idOf(req)))
}
