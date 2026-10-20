import { Router } from 'express'
import {
  ALERTS_MIN_ROLE,
  alertSettingsSchema,
  createAlertDestinationSchema,
  updateAlertDestinationSchema,
  verifyAlertCodeSchema,
} from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { authenticate } from '../../middlewares/authenticate.js'
import { requireMinRole } from '../../middlewares/authorize.js'
import {
  alertCodeSendLimiter,
  alertCodeVerifyLimiter,
  alertTestLimiter,
} from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/**
 * Alertas da equipe. ALERTS_MIN_ROLE (ADMIN): um destino recebe nome de cliente,
 * valor de pedido e mensagem do atendimento num e-mail, chat ou telefone que a
 * loja não controla — escolher para onde isso vai não é tarefa de STAFF.
 */
export const adminAlertRoutes: Router = Router()

adminAlertRoutes.use(authenticate, requireMinRole(ALERTS_MIN_ROLE))

adminAlertRoutes.get('/', controller.overviewController)
adminAlertRoutes.get('/history', controller.historyController)
adminAlertRoutes.put('/settings', validate({ body: alertSettingsSchema }), controller.updateSettingsController)

adminAlertRoutes.post(
  '/destinations',
  alertCodeSendLimiter,
  validate({ body: createAlertDestinationSchema }),
  controller.createDestinationController,
)
adminAlertRoutes.patch(
  '/destinations/:id',
  validate({ body: updateAlertDestinationSchema }),
  controller.updateDestinationController,
)
adminAlertRoutes.delete('/destinations/:id', controller.deleteDestinationController)

adminAlertRoutes.post('/destinations/:id/resend', alertCodeSendLimiter, controller.resendController)
adminAlertRoutes.post(
  '/destinations/:id/verify',
  alertCodeVerifyLimiter,
  validate({ body: verifyAlertCodeSchema }),
  controller.verifyController,
)
/** Sem limitador próprio: a tela chama em sequência, e cada chamada já segura até 10 s. */
adminAlertRoutes.post('/destinations/:id/telegram-sync', controller.telegramSyncController)
adminAlertRoutes.post('/destinations/:id/test', alertTestLimiter, controller.testController)
