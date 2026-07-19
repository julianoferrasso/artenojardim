import type { Request, Response } from 'express'
import type { QuoteRequestInput } from '@ecommerce/shared/contracts'
import { ok } from '../../shared/http.js'
import * as service from './service.js'
import type { OAuthCallbackInput } from './schemas.js'

/** Cotação de frete. Pública — a loja cota no produto mesmo sem login. */
export const quoteController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.quoteShipping(req.body as QuoteRequestInput))
}

/** Staff inicia a conexão da conta do Melhor Envio; devolve a URL de consentimento. */
export const connectController = async (_req: Request, res: Response): Promise<void> => {
  ok(res, await service.startProviderConnection())
}

/**
 * Callback do OAuth (chamado pela loja, que recebeu o redirect do Melhor Envio).
 * Valida o state e persiste os tokens.
 */
export const callbackController = async (req: Request, res: Response): Promise<void> => {
  const { code, state } = req.body as OAuthCallbackInput
  await service.finishProviderConnection(code, state)
  ok(res, { connected: true })
}

/** Staff consulta se a conta está conectada (para a tela de configurações). */
export const statusController = async (_req: Request, res: Response): Promise<void> => {
  ok(res, await service.providerStatus())
}
