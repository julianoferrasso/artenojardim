import type { Request, Response } from 'express'
import { mercadoPagoConfig } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { isAppError } from '../../shared/errors.js'
import { constructWebhookEvent } from '../../integrations/stripe/index.js'
import { verifyMpSignature } from '../../integrations/mercadopago/index.js'
import { syncMercadoPagoOrder } from '../payments/service.js'
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

const header = (req: Request, name: string): string | undefined => {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

/**
 * Endpoint do webhook do Mercado Pago (tópico "Order").
 *
 * A notificação não é a verdade, é um "olhe de novo": validada a assinatura,
 * relemos a order no MP e aplicamos o estado dela. Por isso não há tabela de
 * eventos — reentrega, duplicata e ordem trocada caem no mesmo estado relido, e
 * as escritas são guardadas pelo status atual.
 *
 * Responder em até 22 s, senão o MP reenvia a cada 15 min. Erro de processamento
 * propaga → 5xx → reenvio, que é o que queremos.
 */
export const mercadoPagoWebhookController = async (req: Request, res: Response): Promise<void> => {
  const query = req.query as Record<string, string | undefined>
  const body = (req.body ?? {}) as { action?: string; type?: string; data?: { id?: string }; live_mode?: boolean }

  // O id assinado é o da QUERY da URL notificada; o do corpo é só fallback de log.
  const dataId = query['data.id'] ?? body.data?.id
  const requestId = header(req, 'x-request-id')
  const type = query['type'] ?? body.type

  if (!mercadoPagoConfig.webhookSecret) {
    logger.error(
      { environment: mercadoPagoConfig.environment },
      'webhook Mercado Pago: segredo do ambiente ativo ausente (MP_WEBHOOK_SECRET / MP_WEBHOOK_SECRET_TEST) — notificação recusada',
    )
    res.status(503).send('Webhook não configurado')
    return
  }

  const valid = verifyMpSignature({
    signature: header(req, 'x-signature'),
    requestId,
    dataId: query['data.id'],
    secret: mercadoPagoConfig.webhookSecret,
  })
  if (!valid) {
    // O x-signature é um HMAC com timestamp, não segredo: logá-lo é o que permite
    // reproduzir o cálculo quando o MP e nós discordamos.
    logger.warn(
      {
        requestId,
        dataId,
        type,
        signature: header(req, 'x-signature'),
        environment: mercadoPagoConfig.environment,
        liveMode: body.live_mode,
      },
      'webhook Mercado Pago: assinatura inválida',
    )
    res.status(401).send('Assinatura inválida')
    return
  }

  if (type !== 'order' || !dataId) {
    logger.info({ requestId, type, action: body.action }, 'webhook Mercado Pago: tópico sem handler')
    res.status(200).json({ received: true })
    return
  }

  const result = await syncMercadoPagoOrder(dataId)
  logger.info(
    { requestId, action: body.action, mpOrderId: dataId, liveMode: body.live_mode, result },
    'webhook Mercado Pago: order sincronizada',
  )
  res.status(200).json({ received: true })
}
