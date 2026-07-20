import type { Request, Response } from 'express'
import type {
  CustomerOrderListQuery,
  CustomerCancelInput,
  SupportMessageInput,
} from '@ecommerce/shared/contracts'
import { ok, paginated } from '../../shared/http.js'
import * as service from './service.js'
import * as paymentsService from '../payments/service.js'

/** Pedidos do cliente logado. req.auth!.sub = customerId (autenticado como cliente). */
const customerId = (req: Request): string => req.auth!.sub
const orderId = (req: Request): string => req.params['id'] as string

export const listController = async (req: Request, res: Response): Promise<void> => {
  const query = req.query as unknown as CustomerOrderListQuery
  const { items, meta } = await service.listOrders(customerId(req), query)
  paginated(res, items, meta)
}

export const detailController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.getOrder(customerId(req), orderId(req)))
}

/** Polling da tela de confirmação (Pix/boleto na Fase 1.12). */
export const statusController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.getOrderStatus(customerId(req), orderId(req)))
}

/** Cria/reusa o PaymentIntent do pedido e devolve o clientSecret (Payment Element). */
export const paymentController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await paymentsService.ensureOrderPayment(customerId(req), orderId(req)))
}

/** Cancela de verdade ou registra a solicitação — o service decide qual. */
export const cancelController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.cancelOrder(customerId(req), orderId(req), req.body as CustomerCancelInput))
}

export const supportController = async (req: Request, res: Response): Promise<void> => {
  ok(
    res,
    await service.sendSupportMessage(
      customerId(req),
      orderId(req),
      req.body as SupportMessageInput,
    ),
  )
}

export const reorderController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.reorder(customerId(req), orderId(req)))
}
