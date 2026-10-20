import { z } from 'zod'
import { ALERT_EVENT_TYPES, alertChannelSchema, alertEventTypeSchema } from '../constants/enums.js'

/**
 * Alertas da equipe: destinos (e-mail, chat do Telegram, número de WhatsApp) e os
 * eventos que cada um recebe. Todo destino nasce pendente e só recebe alerta
 * depois de confirmado por um código de 6 dígitos que chega nele mesmo — é o que
 * impede mandar dado da loja para um endereço digitado errado.
 */

export const ALERT_CODE_LENGTH = 6

const labelSchema = z
  .string()
  .trim()
  .min(1, 'Dê um nome para reconhecer este destino')
  .max(60, 'Use até 60 caracteres')

const alertEmailSchema = z.string().trim().toLowerCase().email('E-mail inválido').max(254)

/**
 * Número de WhatsApp como a API da Meta recebe: E.164 só com dígitos, sem "+".
 * Sem "+" na frente é número brasileiro — DDD + número ganha o 55. Com "+", vale
 * o DDI digitado (outro país). Quem confirma que o número existe é o código.
 */
export const whatsappNumberSchema = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    const international = raw.startsWith('+')
    const digits = raw.replace(/\D/g, '')
    const number = !international && digits.length <= 11 ? `55${digits}` : digits
    const valid = number.startsWith('55')
      ? /^55[1-9]{2}\d{8,9}$/.test(number)
      : international && /^[1-9]\d{7,14}$/.test(number)

    if (!valid) {
      ctx.addIssue({
        code: 'custom',
        message: 'Número inválido. Use DDD + número, ou + e o código do país.',
      })
      return z.NEVER
    }
    return number
  })

export const createAlertDestinationSchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('EMAIL'), label: labelSchema, email: alertEmailSchema }),
  z.object({ channel: z.literal('WHATSAPP'), label: labelSchema, phone: whatsappNumberSchema }),
  /**
   * Telegram não tem endereço digitado: o chat nasce do "Iniciar" no link, que
   * serve tanto para a conversa com o bot quanto para um grupo.
   */
  z.object({ channel: z.literal('TELEGRAM'), label: labelSchema }),
])

export type CreateAlertDestinationInput = z.input<typeof createAlertDestinationSchema>
export type CreateAlertDestinationData = z.output<typeof createAlertDestinationSchema>

export const verifyAlertCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${ALERT_CODE_LENGTH}}$`), `O código tem ${ALERT_CODE_LENGTH} dígitos`),
})

export type VerifyAlertCodeInput = z.infer<typeof verifyAlertCodeSchema>

/**
 * Edição parcial. Sem `.default()`: no Zod 4 o default sobrevive ao `partial()` e
 * reescreveria o campo que ninguém mandou. O endereço não muda: trocar o e-mail é
 * outro destino, e outro destino passa pelo código de novo.
 */
export const updateAlertDestinationSchema = z
  .object({
    label: labelSchema.optional(),
    events: z
      .array(alertEventTypeSchema)
      .max(ALERT_EVENT_TYPES.length)
      .transform((list) => [...new Set(list)])
      .optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => v.label !== undefined || v.events !== undefined || v.enabled !== undefined, {
    message: 'Nada para alterar',
  })

export type UpdateAlertDestinationInput = z.input<typeof updateAlertDestinationSchema>
export type UpdateAlertDestinationData = z.output<typeof updateAlertDestinationSchema>

export const alertSettingsSchema = z.object({
  /** Disponível igual ou abaixo disto = estoque baixo. 0 = só avisa quando esgota. */
  lowStockThreshold: z
    .number()
    .int('Use um número inteiro')
    .min(0, 'Use 0 ou mais')
    .max(999, 'Use até 999'),
})

export type AlertSettings = z.infer<typeof alertSettingsSchema>

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

export const alertDestinationSchema = z.object({
  id: z.string(),
  channel: alertChannelSchema,
  label: z.string(),
  /** E-mail, número (só dígitos) ou chat_id. Null = Telegram ainda sem chat vinculado. */
  address: z.string().nullable(),
  /** Como mostrar o chat do Telegram: "@fulano" ou o nome do grupo. */
  addressLabel: z.string().nullable(),
  events: z.array(alertEventTypeSchema),
  enabled: z.boolean(),
  verified: z.boolean(),
  /** O que falta para ativar: abrir o link no Telegram, ou digitar o código. Null = ativo. */
  pendingStep: z.enum(['telegram_link', 'code']).nullable(),
  /** Validade do código ou do link pendente. */
  pendingExpiresAt: z.string().nullable(),
  /** A partir de quando dá para pedir outro código. */
  resendAvailableAt: z.string().nullable(),
  lastSentAt: z.string().nullable(),
  lastError: z.string().nullable(),
  lastErrorAt: z.string().nullable(),
  createdAt: z.string(),
})

export type AlertDestination = z.infer<typeof alertDestinationSchema>

export const alertsOverviewSchema = z.object({
  /** O que o servidor tem configurado. Canal indisponível não aceita destino novo. */
  channels: z.object({
    EMAIL: z.object({ available: z.boolean() }),
    TELEGRAM: z.object({
      available: z.boolean(),
      botUsername: z.string().nullable(),
      /** Token configurado, mas o Telegram não o aceitou (ou não respondeu). */
      problem: z.string().nullable(),
    }),
    WHATSAPP: z.object({ available: z.boolean() }),
  }),
  destinations: z.array(alertDestinationSchema),
  settings: alertSettingsSchema,
})

export type AlertsOverview = z.infer<typeof alertsOverviewSchema>

/**
 * Criar ou reenviar. Os links do Telegram só existem nesta resposta: o banco
 * guarda o hash do token, então não dá para remontá-los depois — perdeu, gera outro.
 */
export const alertDestinationStepSchema = z.object({
  destination: alertDestinationSchema,
  telegramLinks: z
    .object({
      /** Conversa direta com o bot. */
      private: z.string(),
      /** Escolher um grupo, que recebe o bot e os alertas. */
      group: z.string(),
    })
    .nullable(),
})

export type AlertDestinationStep = z.infer<typeof alertDestinationStepSchema>

export const telegramLinkStatusSchema = z.object({
  /** waiting = ninguém tocou em Iniciar ainda; code_sent = o bot mandou o código no chat. */
  state: z.enum(['waiting', 'code_sent', 'verified', 'expired']),
  destination: alertDestinationSchema,
})

export type TelegramLinkStatus = z.infer<typeof telegramLinkStatusSchema>

export const alertTestResultSchema = z.object({ sentTo: z.string() })

export type AlertTestResult = z.infer<typeof alertTestResultSchema>

export const alertHistoryItemSchema = z.object({
  id: z.string(),
  type: alertEventTypeSchema,
  title: z.string(),
  createdAt: z.string(),
  deliveries: z.array(
    z.object({
      destinationId: z.string(),
      label: z.string(),
      channel: alertChannelSchema,
      delivered: z.boolean(),
      error: z.string().nullable(),
      at: z.string(),
    }),
  ),
})

export type AlertHistoryItem = z.infer<typeof alertHistoryItemSchema>
