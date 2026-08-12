import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { prisma } from '../../config/prisma.js'
import { sendEmail } from '../../integrations/email/index.js'
import type { EmailContent } from '../../integrations/email/index.js'
import { permanentError } from '../consumer.js'
import { renderCampaignEmail, type CampaignEmailData } from './render-campaign.js'
import { renderOrderEmail, type OrderEmailData } from './render-order.js'

/**
 * Consumidor genérico de `email.*`. Recebe QUAL template e OS DADOS; não decide
 * conteúdo — só renderiza, respeita a vazão e registra o resultado.
 *
 * O `recipientId` só existe em campanha: e-mail transacional não tem linha de
 * destinatário para atualizar.
 */

export type EmailJob =
  | { template: 'marketing_product'; to: string; recipientId: string; data: CampaignEmailData }
  | { template: 'order_confirmation'; to: string; data: OrderEmailData }

/**
 * Erros do SES que NÃO adianta repetir: o endereço não existe, a conta está
 * suspensa, o destinatário não está verificado (sandbox). Repetir três vezes só
 * enche a DLQ de ruído e faz o alerta de "DLQ > 0" perder o sentido.
 */
const PERMANENT_SES_ERRORS = new Set([
  'MessageRejected',
  'MailFromDomainNotVerifiedException',
  'AccountSuspendedException',
  'SendingPausedException',
])

const isPermanentSesError = (err: unknown): boolean => {
  const name = (err as { name?: string; cause?: { name?: string } })?.name
  const causeName = (err as { cause?: { name?: string } })?.cause?.name
  return PERMANENT_SES_ERRORS.has(name ?? '') || PERMANENT_SES_ERRORS.has(causeName ?? '')
}

/**
 * Espaça os envios para não estourar o limite do SES (~14/s).
 *
 * Mora AQUI e não em `integrations/email/`: é restrição de vazão do consumidor,
 * não da forma de falar com o SES. Um sleep simples basta porque `prefetch(1)`
 * já garante uma mensagem por vez neste processo.
 */
const throttle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.ceil(1000 / env.EMAIL_SEND_RATE_PER_SECOND)))

/** Fecha a campanha quando não resta ninguém em voo. */
const settleCampaignIfDone = async (campaignId: string): Promise<void> => {
  const pending = await prisma.emailCampaignRecipient.count({
    where: { campaignId, status: { in: ['PENDING', 'QUEUED', 'SENDING'] } },
  })
  if (pending > 0) return

  const failed = await prisma.emailCampaignRecipient.count({
    where: { campaignId, status: 'FAILED' },
  })
  const total = await prisma.emailCampaignRecipient.count({ where: { campaignId } })

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    // Só é FAILED se NINGUÉM recebeu. Com um envio bem-sucedido a campanha
    // aconteceu — os endereços mortos ficam registrados linha a linha.
    data: { status: failed === total ? 'FAILED' : 'SENT', sentAt: new Date() },
  })
}

export const emailSendHandler = async (job: EmailJob): Promise<void> => {
  if (job.template === 'marketing_product') {
    await sendCampaignEmail(job)
    return
  }

  const content = await renderOrderEmail(job.data)
  await deliver(content, job.to, 'order_confirmation')
}

const sendCampaignEmail = async (
  job: Extract<EmailJob, { template: 'marketing_product' }>,
): Promise<void> => {
  // Trava de idempotência de NEGÓCIO: só envia quem conseguir mover QUEUED →
  // SENDING. `count === 0` significa que outra entrega da mesma mensagem já
  // pegou este destinatário — ack e segue, sem segundo e-mail.
  const claimed = await prisma.emailCampaignRecipient.updateMany({
    where: { id: job.recipientId, status: 'QUEUED' },
    data: { status: 'SENDING' },
  })

  if (claimed.count === 0) {
    logger.info({ recipientId: job.recipientId }, 'destinatário já processado — ignorado')
    return
  }

  const recipient = await prisma.emailCampaignRecipient.findUnique({
    where: { id: job.recipientId },
    select: { campaignId: true },
  })

  try {
    const content = await renderCampaignEmail(job.data, job.to)
    await deliver(content.email, job.to, 'marketing_product', content.headers)

    await prisma.emailCampaignRecipient.update({
      where: { id: job.recipientId },
      data: { status: 'SENT', sentAt: new Date(), error: null },
    })
  } catch (err) {
    const permanent = isPermanentSesError(err)

    await prisma.emailCampaignRecipient.update({
      where: { id: job.recipientId },
      data: {
        // Transitório volta para QUEUED: o retry precisa reencontrá-lo
        // reivindicável, senão a trava acima o descarta como "já processado".
        status: permanent ? 'FAILED' : 'QUEUED',
        error: err instanceof Error ? err.message.slice(0, 500) : 'erro desconhecido',
      },
    })

    if (permanent) {
      // Endereço inválido não é bug nosso: registra, fecha a campanha se for o
      // último, e não gasta retry.
      if (recipient) await settleCampaignIfDone(recipient.campaignId)
      throw permanentError(`SES recusou o envio para ${job.to}`, err)
    }

    throw err
  }

  if (recipient) await settleCampaignIfDone(recipient.campaignId)
}

const deliver = async (
  content: EmailContent,
  to: string,
  template: string,
  headers?: Record<string, string>,
): Promise<void> => {
  // `sendEmail` e não `sendEmailSafe`: aqui a falha PRECISA subir, senão o retry
  // e a DLQ nunca acontecem — é a fila que dá a segunda chance.
  await sendEmail({ ...content, to, tags: { template }, ...(headers ? { headers } : {}) })
  await throttle()
}
