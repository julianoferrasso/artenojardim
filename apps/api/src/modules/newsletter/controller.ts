import type { Request, Response } from 'express'
import type { SubscribeNewsletterInput, UnsubscribeInput } from '@ecommerce/shared/contracts'
import { noContent } from '../../shared/http.js'
import { parseUnsubscribeToken } from '../../shared/unsubscribe.js'
import * as service from './service.js'

export const subscribeController = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as SubscribeNewsletterInput
  await service.subscribe(body.email)
  // 204 sempre — inclusive para e-mail já inscrito. Não confirmar a existência
  // evita que o formulário vire um oráculo de enumeração de inscritos.
  noContent(res)
}

export const unsubscribeController = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as UnsubscribeInput
  // O e-mail vem do token assinado, nunca do corpo: aceitar um endereço avulso
  // deixaria qualquer um descadastrar qualquer pessoa.
  await service.unsubscribeByEmail(parseUnsubscribeToken(body.token))
  noContent(res)
}
