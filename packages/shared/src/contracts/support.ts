import { z } from 'zod'
import {
  supportAuthorSchema,
  supportThreadStatusSchema,
  paymentStatusSchema,
  fulfillmentStatusSchema,
  paymentMethodSchema,
} from '../constants/enums.js'
import { moneySchema } from './common.js'
import { orderSituationSchema } from './order-situation.js'

/**
 * Atendimento: a conversa entre o cliente e a loja sobre um pedido.
 *
 * Uma conversa por pedido. O cliente escreve pela página do pedido; a loja
 * responde pelo menu Atendimento do admin, e a resposta aparece na mesma página
 * (e chega por e-mail). Antes disto, a mensagem virava um evento na timeline que
 * ninguém via e ninguém podia responder.
 */

// ---------------------------------------------------------------------------
// Assunto
// ---------------------------------------------------------------------------

export const SUPPORT_TOPICS = ['DELIVERY', 'PAYMENT', 'PRODUCT', 'CANCELLATION', 'RETURN', 'OTHER'] as const
export const supportTopicSchema = z.enum(SUPPORT_TOPICS)
export type SupportTopic = z.infer<typeof supportTopicSchema>

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export const supportMessageSchema = z.object({
  topic: supportTopicSchema.default('OTHER'),
  message: z.string().trim().min(10, 'Descreva com pelo menos 10 caracteres').max(1000),
})

export type SupportMessageInput = z.infer<typeof supportMessageSchema>

/**
 * Mensagem na visão do cliente. Sem `userId` e sem nome de funcionário: para o
 * cliente quem responde é a loja, não a pessoa que estava de plantão.
 */
export const customerSupportMessageSchema = z.object({
  id: z.string(),
  author: supportAuthorSchema,
  topic: supportTopicSchema.nullable(),
  body: z.string(),
  createdAt: z.string(),
})

export type CustomerSupportMessage = z.infer<typeof customerSupportMessageSchema>

export const customerSupportThreadSchema = z.object({
  status: supportThreadStatusSchema,
  messages: z.array(customerSupportMessageSchema),
})

export type CustomerSupportThread = z.infer<typeof customerSupportThreadSchema>

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** Abas da tela. CANCEL_REQUESTS atravessa os status: é "o que pede decisão". */
export const SUPPORT_VIEWS = ['OPEN', 'ANSWERED', 'CLOSED', 'CANCEL_REQUESTS', 'ALL'] as const
export const supportViewSchema = z.enum(SUPPORT_VIEWS)
export type SupportView = z.infer<typeof supportViewSchema>

export const supportThreadListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  view: supportViewSchema.default('OPEN'),
  /** "#1042", nome ou e-mail do cliente. */
  q: z.string().trim().max(120).optional(),
})

export type SupportThreadListQuery = z.infer<typeof supportThreadListQuerySchema>

export const supportThreadListItemSchema = z.object({
  id: z.string(),
  status: supportThreadStatusSchema,
  customerName: z.string(),
  customerEmail: z.string(),
  orderId: z.string().nullable(),
  orderNumber: z.number().int().nullable(),
  cancelRequested: z.boolean(),
  lastMessageAt: z.string(),
  lastCustomerMessageAt: z.string().nullable(),
  /** A última mensagem, para a linha da lista dizer do que se trata. */
  preview: z
    .object({ author: supportAuthorSchema, topic: supportTopicSchema.nullable(), body: z.string() })
    .nullable(),
})

export type SupportThreadListItem = z.infer<typeof supportThreadListItemSchema>

export const adminSupportMessageSchema = customerSupportMessageSchema.extend({
  /** Nome do funcionário que respondeu. Null para cliente e sistema. */
  authorName: z.string().nullable(),
})

export type AdminSupportMessage = z.infer<typeof adminSupportMessageSchema>

/** O pedido ao lado da conversa: o bastante para decidir sem trocar de tela. */
export const supportThreadOrderSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  situation: orderSituationSchema,
  paymentStatus: paymentStatusSchema,
  fulfillmentStatus: fulfillmentStatusSchema,
  paymentMethod: paymentMethodSchema.nullable(),
  total: moneySchema,
  createdAt: z.string(),
  canceledAt: z.string().nullable(),
  cancelRequest: z.object({ requestedAt: z.string(), reason: z.string().nullable() }).nullable(),
  refundableAmount: moneySchema,
  canCancel: z.boolean(),
})

export type SupportThreadOrder = z.infer<typeof supportThreadOrderSchema>

export const supportThreadSchema = z.object({
  id: z.string(),
  status: supportThreadStatusSchema,
  createdAt: z.string(),
  lastMessageAt: z.string(),
  closedAt: z.string().nullable(),
  customer: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  order: supportThreadOrderSchema.nullable(),
  messages: z.array(adminSupportMessageSchema),
})

export type SupportThread = z.infer<typeof supportThreadSchema>

export const supportReplySchema = z.object({
  body: z.string().trim().min(1, 'Escreva a resposta').max(2000),
  /** Responder e encerrar de uma vez: o caso comum de "resolvido, obrigado". */
  close: z.boolean().default(false),
})

export type SupportReplyInput = z.input<typeof supportReplySchema>
export type SupportReplyData = z.output<typeof supportReplySchema>

/** Reabrir é voltar para OPEN; ANSWERED só nasce de uma resposta. */
export const supportStatusSchema = z.object({
  status: z.enum(['OPEN', 'CLOSED']),
})

export type SupportStatusInput = z.infer<typeof supportStatusSchema>

export const supportSummarySchema = z.object({
  awaitingReply: z.number().int().nonnegative(),
  cancelRequests: z.number().int().nonnegative(),
  /**
   * Conversas que pedem ação, cada uma contada UMA vez — o número do menu. Não é
   * a soma dos dois acima: o pedido de cancelamento também deixa a conversa
   * aguardando resposta, e somar contaria o mesmo cliente duas vezes.
   */
  needsAction: z.number().int().nonnegative(),
})

export type SupportSummary = z.infer<typeof supportSummarySchema>
