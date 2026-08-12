import { z } from 'zod'
import { cuidSchema, emailSchema, paginationMetaSchema } from './common.js'
import {
  emailCampaignKindSchema,
  emailCampaignStatusSchema,
} from '../constants/enums.js'

/**
 * Campanha de e-mail de marketing de um produto.
 *
 * Destinatário = união de duas origens independentes, deduplicada por ENDEREÇO:
 * clientes com `acceptsMarketing` e e-mail confirmado, e inscritos ativos da
 * newsletter. O mesmo endereço pode estar nas duas — daí `source: 'BOTH'`.
 */

/** De onde veio o consentimento. BOTH = o endereço existe nas duas listas. */
export const CAMPAIGN_RECIPIENT_SOURCES = ['CUSTOMER', 'NEWSLETTER', 'BOTH'] as const
export const campaignRecipientSourceSchema = z.enum(CAMPAIGN_RECIPIENT_SOURCES)
export type CampaignRecipientSource = z.infer<typeof campaignRecipientSourceSchema>

export const campaignRecipientPreviewSchema = z.object({
  /**
   * A chave é o E-MAIL, não um id. É o que a dedupe usa, e é o que a exclusão
   * precisa usar: excluir por id do cliente deixaria a metade "newsletter" do
   * mesmo endereço passar, e quem foi desmarcado receberia o e-mail assim mesmo.
   */
  email: z.string(),
  /** Nulo quando o endereço só existe na newsletter (não há conta, não há nome). */
  name: z.string().nullable(),
  source: campaignRecipientSourceSchema,
})

export type CampaignRecipientPreview = z.infer<typeof campaignRecipientPreviewSchema>

/**
 * Prévia dos destinatários, paginada. `total` é o total REAL da união, não o
 * tamanho da página: é o número que a tela mostra ao lojista antes de disparar.
 */
export const campaignPreviewSchema = z.object({
  total: z.number().int().nonnegative(),
  recipients: z.array(campaignRecipientPreviewSchema),
  meta: paginationMetaSchema,
})

export type CampaignPreview = z.infer<typeof campaignPreviewSchema>

/** Teto de exclusões: ~40 bytes por e-mail, dentro do limite do body da API. */
export const MAX_EXCLUDED_EMAILS = 5000

export const sendProductCampaignSchema = z.object({
  kind: emailCampaignKindSchema.default('MANUAL'),
  /**
   * Endereços a EXCLUIR deste envio. NÃO altera a preferência gravada de
   * ninguém: o lojista decide quem recebe AGORA, não por quem o cliente é. Sair
   * da lista de vez é escolha do cliente, pelo link de descadastro.
   */
  excludedEmails: z.array(emailSchema).max(MAX_EXCLUDED_EMAILS).default([]),
  /** Sobrescreve o assunto padrão do template. Vazio = usa o do template. */
  subject: z.string().trim().min(3).max(150).optional(),
})

export type SendProductCampaignInput = z.infer<typeof sendProductCampaignSchema>

export const campaignSchema = z.object({
  id: cuidSchema,
  kind: emailCampaignKindSchema,
  status: emailCampaignStatusSchema,
  productId: z.string().nullable(),
  /** Nome do produto no momento da leitura; nulo se o produto foi removido. */
  productName: z.string().nullable(),
  /** Snapshot: o assunto REALMENTE enviado, mesmo que o produto mude depois. */
  subject: z.string(),
  recipientCount: z.number().int().nonnegative(),
  sentCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  sentAt: z.string().nullable(),
})

export type Campaign = z.infer<typeof campaignSchema>

/**
 * Descadastro público — sem login. O token é HMAC assinado com segredo próprio
 * e NÃO expira: um e-mail de dois anos atrás ainda tem que conseguir sair da
 * lista. Link que expira transforma "sair" em "marcar como spam".
 */
export const unsubscribeSchema = z.object({ token: z.string().min(1).max(500) })

export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>
