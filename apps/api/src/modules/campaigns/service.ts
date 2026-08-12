import { Prisma } from '@prisma/client'
import { EVENTS } from '@ecommerce/shared/constants'
import {
  ERROR_CODES,
  type Campaign,
  type CampaignPreview,
  type PaginationMeta,
  type PaginationQuery,
  type SendProductCampaignInput,
} from '@ecommerce/shared/contracts'
import { env } from '../../config/env.js'
import { prisma } from '../../config/prisma.js'
import { businessError, conflict } from '../../shared/errors.js'
import { audit } from '../../shared/audit.js'
import { publish } from '../../shared/publish.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { buildMeta, toPrismaPagination } from '../../shared/pagination.js'
import { formatBRL } from '../../utils/money.js'
import { getProduct } from '../products/service.js'
import type { CampaignEmailData } from '../../queues/consumers/render-campaign.js'
import { excludeRecipients, paginateRecipients } from './domain/recipients.js'
import { findRecipients } from './repository.js'

/**
 * Campanhas de e-mail de marketing de um produto.
 *
 * O disparo NÃO envia nada: grava a campanha, grava uma linha por destinatário e
 * publica UMA mensagem. O envio real acontece no worker, e é por isso que a rota
 * responde 202 e não 200.
 */

export type CampaignContext = { userId?: string | undefined; ip?: string | undefined; userAgent?: string | undefined }

/** Prévia paginada: é o que a aba "Avançado" do diálogo mostra. */
export const previewRecipients = async (query: PaginationQuery): Promise<CampaignPreview> => {
  const all = await findRecipients(getActiveStoreId())

  return {
    total: all.length,
    recipients: paginateRecipients(all, query.page, query.perPage),
    meta: buildMeta(query, all.length),
  }
}

/**
 * "A partir de R$ X" só quando as variantes têm preços diferentes — com preço
 * único, o "a partir de" sugere uma faixa que não existe.
 */
const priceLabelOf = (range: { min: number; max: number }): string =>
  range.min === range.max ? formatBRL(range.min) : `A partir de ${formatBRL(range.min)}`

export const sendProductCampaign = async (
  productId: string,
  input: SendProductCampaignInput,
  ctx: CampaignContext,
): Promise<Campaign> => {
  const storeId = getActiveStoreId()

  // Pelo SERVICE do outro módulo, nunca pelo repository dele: é a regra que
  // mantém a fronteira entre módulos. `publicOnly: false` porque staff enxerga
  // rascunho — a validação de "publicável" é logo abaixo, e com mensagem própria.
  const product = await getProduct(productId, { publicOnly: false })

  if (product.status !== 'ACTIVE') {
    throw businessError(
      ERROR_CODES.PRODUCT_NOT_ACTIVE,
      'Publique o produto antes de divulgá-lo: o e-mail levaria o cliente a uma página que não existe.',
      422,
    )
  }

  const all = await findRecipients(storeId)
  const recipients = excludeRecipients(all, input.excludedEmails)

  if (recipients.length === 0) {
    throw businessError(
      ERROR_CODES.CAMPAIGN_NO_RECIPIENTS,
      'Nenhum destinatário para esta campanha.',
      422,
    )
  }

  const subject = input.subject ?? `Novidade: ${product.name}`

  // Snapshot do produto AGORA. Persistido, e não recalculado no worker: o preço
  // pode mudar no meio de um envio de 2.000 e-mails, e a campanha tem de ser uma
  // só. Ver o comentário de `snapshotJson` no schema.
  const snapshot: CampaignEmailData = {
    productName: product.name,
    productUrl: `${env.STORE_URL.replace(/\/$/, '')}/produtos/${product.slug}`,
    imageUrl: product.images[0]?.url ?? null,
    priceLabel: priceLabelOf(product.priceRange),
    shortDescription: product.shortDescription,
    subject,
  }

  let campaign: { id: string; createdAt: Date }

  try {
    campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.emailCampaign.create({
        data: {
          storeId,
          kind: input.kind,
          productId: product.id,
          subject,
          snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
          recipientCount: recipients.length,
          createdBy: ctx.userId ?? null,
        },
        select: { id: true, createdAt: true },
      })

      // Gravados de forma SÍNCRONA, num INSERT só. É o que torna o fan-out
      // retomável: se o worker morrer no meio, o retry relê os que ficaram
      // PENDING e continua de onde parou — sem cursor, sem contador.
      await tx.emailCampaignRecipient.createMany({
        data: recipients.map((r) => ({
          campaignId: created.id,
          email: r.email,
          customerId: r.customerId,
        })),
        skipDuplicates: true,
      })

      return created
    })
  } catch (err) {
    // Índice parcial: este produto já teve o e-mail de novidade disparado.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict(
        'Este produto já teve o e-mail de novidade enviado. Para divulgá-lo de novo, use o envio manual.',
        ERROR_CODES.CAMPAIGN_ALREADY_SENT,
      )
    }
    throw err
  }

  // DEPOIS do commit, sempre: publicar dentro da transação colocaria na fila um
  // evento sobre uma campanha que o rollback desfez.
  await audit({
    action: EVENTS.campaign.sent,
    entityType: 'EmailCampaign',
    entityId: campaign.id,
    changes: {
      product: { from: null, to: product.name },
      kind: { from: null, to: input.kind },
      recipientCount: { from: null, to: recipients.length },
    },
    context: ctx,
  })

  // Falha aqui deixa a campanha PENDING — recuperável, e o 503 diz ao lojista
  // que o envio não começou, em vez de fingir que começou.
  await publish(EVENTS.campaign.dispatchRequested, { campaignId: campaign.id })

  return {
    id: campaign.id,
    kind: input.kind,
    status: 'PENDING',
    productId: product.id,
    productName: product.name,
    subject,
    recipientCount: recipients.length,
    sentCount: 0,
    failedCount: 0,
    createdAt: campaign.createdAt.toISOString(),
    sentAt: null,
  }
}

export const listCampaigns = async (
  query: PaginationQuery,
): Promise<{ items: Campaign[]; meta: PaginationMeta }> => {
  const where = { storeId: getActiveStoreId() }

  const [rows, total] = await Promise.all([
    prisma.emailCampaign.findMany({
      where,
      select: {
        id: true,
        kind: true,
        status: true,
        productId: true,
        subject: true,
        recipientCount: true,
        createdAt: true,
        sentAt: true,
        product: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      ...toPrismaPagination(query),
    }),
    prisma.emailCampaign.count({ where }),
  ])

  // Um groupBy para a página inteira, não uma contagem por campanha: com 24
  // linhas na tela, o N+1 seriam 48 queries para mostrar dois números.
  const stats = await prisma.emailCampaignRecipient.groupBy({
    by: ['campaignId', 'status'],
    where: { campaignId: { in: rows.map((row) => row.id) } },
    _count: { _all: true },
  })

  const countOf = (campaignId: string, status: string): number =>
    stats.find((s) => s.campaignId === campaignId && s.status === status)?._count._all ?? 0

  return {
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      productId: row.productId,
      productName: row.product?.name ?? null,
      subject: row.subject,
      recipientCount: row.recipientCount,
      sentCount: countOf(row.id, 'SENT'),
      failedCount: countOf(row.id, 'FAILED'),
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
    })),
    meta: buildMeta(query, total),
  }
}
