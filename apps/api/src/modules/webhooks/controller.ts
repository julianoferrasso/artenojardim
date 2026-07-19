import type { Request, Response } from 'express'
import { logger } from '../../config/logger.js'
import { isAppError } from '../../shared/errors.js'
import { constructWebhookEvent } from '../../integrations/stripe/index.js'
import { processStripeEvent } from './service.js'

/**
 * Endpoint do webhook do Stripe. NÃO usa o envelope { data } — a resposta é para o
 * Stripe, não para o front: 2xx = "recebido, não reentregue"; 4xx/5xx = reentregar.
 *
 * O corpo chega CRU (Buffer) porque a rota é montada com express.raw ANTES do
 * express.json — a verificação de assinatura precisa dos bytes originais.
 *
 * Erro de processamento (banco fora, etc.) propaga → 500 → o Stripe reentrega, e a
 * idempotência no service garante que a reentrega não duplica efeito.
 */
export const stripeWebhookController = async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['stripe-signature']
  if (typeof signature !== 'string') {
    res.status(400).send('Assinatura ausente')
    return
  }

  let event
  try {
    event = constructWebhookEvent(req.body as Buffer, signature)
  } catch (err) {
    // Assinatura inválida / secret ausente: não vaza detalhe, só o status.
    logger.warn({ err }, 'webhook Stripe: verificação falhou')
    res.status(isAppError(err) ? err.status : 400).send('Assinatura inválida')
    return
  }

  await processStripeEvent(event)
  res.status(200).json({ received: true })
}
