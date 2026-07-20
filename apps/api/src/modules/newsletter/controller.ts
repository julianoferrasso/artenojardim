import type { Request, Response } from 'express'
import type { SubscribeNewsletterInput } from '@ecommerce/shared/contracts'
import { noContent } from '../../shared/http.js'
import * as service from './service.js'

export const subscribeController = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as SubscribeNewsletterInput
  await service.subscribe(body.email)
  // 204 sempre — inclusive para e-mail já inscrito. Não confirmar a existência
  // evita que o formulário vire um oráculo de enumeração de inscritos.
  noContent(res)
}
