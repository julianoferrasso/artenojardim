import type { Request, Response } from 'express'
import type { CheckoutSummaryRequest, ConfirmCheckoutInput } from '@ecommerce/shared/contracts'
import { ok, created } from '../../shared/http.js'
import * as service from './service.js'

/** Prévia do pedido (não cria nada). req.auth!.sub = customerId. */
export const summaryController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.getSummary(req.auth!.sub, req.body as CheckoutSummaryRequest))
}

/** Confirma: cria o pedido PENDING + reserva o estoque. Devolve o pedido. */
export const confirmController = async (req: Request, res: Response): Promise<void> => {
  created(res, await service.confirm(req.auth!.sub, req.body as ConfirmCheckoutInput))
}
