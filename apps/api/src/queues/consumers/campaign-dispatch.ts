import { EVENTS } from '@ecommerce/shared/constants'
import { logger } from '../../config/logger.js'
import { prisma } from '../../config/prisma.js'
import { publish } from '../../shared/publish.js'
import { permanentError } from '../consumer.js'
import type { CampaignEmailData } from './render-campaign.js'

/**
 * Fan-out da campanha: uma mensagem entra, N saem — uma por destinatário.
 *
 * ── Por que não fazer o loop de envio aqui dentro ────────────────────────────
 * Com `prefetch(1)`, um handler que envia 2.000 e-mails ocupa o único slot do
 * consumidor por minutos, e a recuperação de senha de um cliente fica presa
 * atrás da campanha de marketing. Pior: uma falha no destinatário 1.500 faria o
 * retry reprocessar os 1.499 anteriores.
 *
 * Aqui só publicamos. O envio real acontece na `email.send`, uma mensagem por
 * pessoa, cada uma com o próprio retry.
 */

export type CampaignDispatchJob = { campaignId: string }

/** Lote de leitura. Grande o bastante para poucas idas ao banco, pequeno o
 *  bastante para o progresso ser visível se algo travar no meio. */
const PAGE_SIZE = 500

export const campaignDispatchHandler = async (job: CampaignDispatchJob): Promise<void> => {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: job.campaignId },
    select: {
      id: true,
      status: true,
      subject: true,
      canceledAt: true,
      product: {
        select: { name: true, slug: true, shortDescription: true },
      },
    },
  })

  if (!campaign) throw permanentError(`campanha ${job.campaignId} não encontrada`)

  if (campaign.canceledAt) {
    logger.info({ campaignId: campaign.id }, 'campanha cancelada — fan-out ignorado')
    return
  }

  // Os dados do produto viajam no payload de cada mensagem. Ler o snapshot UMA
  // vez aqui é o que garante que todos os 2.000 e-mails são iguais, mesmo que o
  // produto mude de preço no meio do envio.
  const snapshot = await loadSnapshot(campaign.id)

  let published = 0

  // Laço em vez de paginação por offset: cada volta relê "os que ainda estão
  // PENDING", e os já publicados saíram do conjunto. Um retry no meio do
  // caminho continua de onde parou, sem cursor nem contador guardado.
  for (;;) {
    const pending = await prisma.emailCampaignRecipient.findMany({
      where: { campaignId: campaign.id, status: 'PENDING' },
      select: { id: true, email: true },
      take: PAGE_SIZE,
    })

    if (pending.length === 0) break

    for (const recipient of pending) {
      // Marca QUEUED **antes** de publicar, e a ordem é deliberada: cair entre
      // os dois deixa um destinatário QUEUED sem mensagem — um e-mail a menos.
      // A ordem inversa (publicar e depois marcar) duplicaria o e-mail no retry.
      // Entre perder e duplicar, perder é o erro que dá para consertar.
      const claimed = await prisma.emailCampaignRecipient.updateMany({
        where: { id: recipient.id, status: 'PENDING' },
        data: { status: 'QUEUED' },
      })
      if (claimed.count === 0) continue

      await publish(EVENTS.email.marketingProduct, {
        template: 'marketing_product',
        to: recipient.email,
        recipientId: recipient.id,
        data: snapshot,
      })
      published += 1
    }
  }

  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: { status: 'SENDING' },
  })

  logger.info({ campaignId: campaign.id, published }, 'fan-out da campanha concluído')
}

/**
 * Reconstrói o snapshot do produto a partir da campanha. O `subject` é o que foi
 * gravado no disparo — o histórico não pode mentir sobre o que o cliente leu.
 */
const loadSnapshot = async (campaignId: string): Promise<CampaignEmailData> => {
  const campaign = await prisma.emailCampaign.findUniqueOrThrow({
    where: { id: campaignId },
    select: { subject: true, snapshotJson: true },
  })

  return campaign.snapshotJson as unknown as CampaignEmailData
}
