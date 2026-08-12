import type { Request, Response } from 'express'
import type { UpdateCustomerProfileInput } from '@ecommerce/shared/contracts'
import { ok } from '../../shared/http.js'
import * as service from './service.js'

export const updateController = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as UpdateCustomerProfileInput
  const customer = await service.updateCustomerProfile(req.auth!.sub, input)
  // Devolve o mesmo formato do /auth/me: o front aplica direto no contexto de
  // sessão, sem refazer a busca do perfil.
  ok(res, { customer })
}
