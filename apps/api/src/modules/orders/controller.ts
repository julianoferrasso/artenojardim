import type { Request, Response } from 'express'
import { ok } from '../../shared/http.js'
import * as service from './service.js'
import * as paymentsService from '../payments/service.js'

/** Pedidos do cliente logado. req.auth!.sub = customerId (autenticado como cliente). */
export const listController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.listOrders(req.auth!.sub))
}

export const detailController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.getOrder(req.auth!.sub, req.params['id'] as string))
}

/** Polling da tela de confirmação (Pix/boleto na Fase 1.12). */
export const statusController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.getOrderStatus(req.auth!.sub, req.params['id'] as string))
}

/** Cria/reusa o PaymentIntent do pedido e devolve o clientSecret (Payment Element). */
export const paymentController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await paymentsService.ensureOrderPayment(req.auth!.sub, req.params['id'] as string))
}
