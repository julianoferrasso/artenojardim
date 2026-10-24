import { z } from 'zod'

/**
 * Fonte da verdade dos enums para o FRONT. O `schema.prisma` declara os mesmos
 * valores para o BANCO — a duplicação é inevitável, porque o browser não pode
 * importar `@prisma/client`.
 *
 * O que impede a divergência silenciosa é `apps/api/test/enum-drift.test.ts`,
 * que compara os dois lados. Mudou aqui, mude lá.
 */

export const USER_ROLES = ['OWNER', 'ADMIN', 'STAFF'] as const
export const userRoleSchema = z.enum(USER_ROLES)
export type UserRole = z.infer<typeof userRoleSchema>

/** Hierarquia implícita: quem está acima pode o que está abaixo. */
export const ROLE_RANK: Record<UserRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  STAFF: 1,
}

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const
export const productStatusSchema = z.enum(PRODUCT_STATUSES)
export type ProductStatus = z.infer<typeof productStatusSchema>

/**
 * Como o produto é vendido em relação ao estoque (que continua por variante):
 * só o disponível (pronta entrega), o disponível e depois sob encomenda, ou
 * sempre sob encomenda.
 */
export const STOCK_POLICIES = ['STOCK_ONLY', 'STOCK_THEN_MADE_TO_ORDER', 'MADE_TO_ORDER'] as const
export const stockPolicySchema = z.enum(STOCK_POLICIES)
export type StockPolicy = z.infer<typeof stockPolicySchema>

export const PAYMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PAID',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES)
export type PaymentStatus = z.infer<typeof paymentStatusSchema>

export const FULFILLMENT_STATUSES = [
  'UNFULFILLED',
  'PICKING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
] as const
export const fulfillmentStatusSchema = z.enum(FULFILLMENT_STATUSES)
export type FulfillmentStatus = z.infer<typeof fulfillmentStatusSchema>

export const PAYMENT_METHODS = ['CARD', 'PIX', 'BOLETO'] as const
export const paymentMethodSchema = z.enum(PAYMENT_METHODS)
export type PaymentMethod = z.infer<typeof paymentMethodSchema>

export const PAYMENT_PROVIDERS = ['STRIPE', 'MERCADO_PAGO'] as const
export const paymentProviderSchema = z.enum(PAYMENT_PROVIDERS)
export type PaymentProvider = z.infer<typeof paymentProviderSchema>

/**
 * Movimento de estoque. Sinal fica em `quantity`, não no tipo.
 * Reserva NÃO está aqui: reserva é intenção, movimento é fato físico.
 */
export const MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE',
  'RETURN',
  'CANCELLATION',
  'ADJUSTMENT',
  'COUNT',
] as const
export const movementTypeSchema = z.enum(MOVEMENT_TYPES)
export type MovementType = z.infer<typeof movementTypeSchema>

export const COUPON_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING'] as const
export const couponTypeSchema = z.enum(COUPON_TYPES)
export type CouponType = z.infer<typeof couponTypeSchema>

export const SHIPMENT_STATUSES = [
  'PENDING',
  'LABEL_PURCHASED',
  'SHIPPED',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
] as const
export const shipmentStatusSchema = z.enum(SHIPMENT_STATUSES)
export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>

/**
 * O que originou a campanha. NEW_PRODUCT só pode acontecer uma vez por produto
 * (índice parcial no banco); MANUAL é o botão da tela do produto e pode repetir.
 */
export const EMAIL_CAMPAIGN_KINDS = ['NEW_PRODUCT', 'MANUAL'] as const
export const emailCampaignKindSchema = z.enum(EMAIL_CAMPAIGN_KINDS)
export type EmailCampaignKind = z.infer<typeof emailCampaignKindSchema>

/** PENDING = fan-out em curso. SENDING = todos na fila, envios em andamento. */
export const EMAIL_CAMPAIGN_STATUSES = ['PENDING', 'SENDING', 'SENT', 'FAILED'] as const
export const emailCampaignStatusSchema = z.enum(EMAIL_CAMPAIGN_STATUSES)
export type EmailCampaignStatus = z.infer<typeof emailCampaignStatusSchema>

/**
 * Como um post do Instagram aparece na loja. IMAGE = a foto re-hospedada no
 * nosso storage, no visual da loja. EMBED = o iframe oficial do Instagram
 * (vídeo, carrossel, curtidas), montado a partir do código "Incorporar".
 */
export const INSTAGRAM_DISPLAY_MODES = ['IMAGE', 'EMBED'] as const
export const instagramDisplayModeSchema = z.enum(INSTAGRAM_DISPLAY_MODES)
export type InstagramDisplayMode = z.infer<typeof instagramDisplayModeSchema>

/**
 * Onde a foto do banner fica no slide (desktop). SIDE = presa à direita, com a
 * altura do slide; COVER = cobre o slide inteiro, por trás do texto. No celular
 * os dois empilham (foto em cima, texto embaixo).
 */
export const BANNER_LAYOUTS = ['SIDE', 'COVER'] as const
export const bannerLayoutSchema = z.enum(BANNER_LAYOUTS)
export type BannerLayout = z.infer<typeof bannerLayoutSchema>

/** Situação de uma conversa do atendimento. OPEN = a vez é da loja responder. */
export const SUPPORT_THREAD_STATUSES = ['OPEN', 'ANSWERED', 'CLOSED'] as const
export const supportThreadStatusSchema = z.enum(SUPPORT_THREAD_STATUSES)
export type SupportThreadStatus = z.infer<typeof supportThreadStatusSchema>

/** SYSTEM = texto que a própria API escreveu (ex.: "cancelamento aprovado"). */
export const SUPPORT_AUTHORS = ['CUSTOMER', 'STAFF', 'SYSTEM'] as const
export const supportAuthorSchema = z.enum(SUPPORT_AUTHORS)
export type SupportAuthor = z.infer<typeof supportAuthorSchema>

/** Por onde um alerta da equipe sai. Cada destino é de um canal e só recebe depois do código. */
export const ALERT_CHANNELS = ['EMAIL', 'TELEGRAM', 'WHATSAPP'] as const
export const alertChannelSchema = z.enum(ALERT_CHANNELS)
export type AlertChannel = z.infer<typeof alertChannelSchema>

/**
 * Fatos que viram alerta para a equipe, na ordem em que a tela os mostra. Tipo
 * novo pede migration: é enum no banco, e cada destino guarda a lista que assina.
 */
export const ALERT_EVENT_TYPES = [
  'ORDER_PAID',
  'CANCELLATION_REQUESTED',
  'ORDER_CANCELED_BY_CUSTOMER',
  'REFUND_FAILED',
  'ORDER_CREATED',
  'PRODUCTION_DUE',
  'CUSTOMER_MESSAGE',
  'LOW_STOCK',
  'SHIPPING_DISCONNECTED',
  'SITE_DOWN',
] as const
export const alertEventTypeSchema = z.enum(ALERT_EVENT_TYPES)
export type AlertEventType = z.infer<typeof alertEventTypeSchema>
