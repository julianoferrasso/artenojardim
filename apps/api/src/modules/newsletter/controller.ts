import type { Request, Response } from 'express'
import { ERROR_CODES, unsubscribeSchema } from '@ecommerce/shared/contracts'
import type { SubscribeNewsletterInput } from '@ecommerce/shared/contracts'
import { noContent } from '../../shared/http.js'
import { businessError } from '../../shared/errors.js'
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
  // Corpo OU query. A página da loja manda no corpo; o one-click do Gmail faz um
  // POST com corpo fixo (`List-Unsubscribe=One-Click`), então lá o token só pode
  // vir na query da URL do cabeçalho List-Unsubscribe.
  const raw = (req.body as { token?: unknown } | undefined)?.token ?? req.query['token']
  const parsed = unsubscribeSchema.safeParse({ token: raw })

  if (!parsed.success) {
    throw businessError(
      ERROR_CODES.UNSUBSCRIBE_TOKEN_INVALID,
      'Este link de descadastro não é válido.',
      400,
    )
  }

  // O e-mail vem do token assinado, nunca de um campo separado: aceitar um
  // endereço avulso deixaria qualquer um descadastrar qualquer pessoa.
  await service.unsubscribeByEmail(parseUnsubscribeToken(parsed.data.token))
  noContent(res)
}
