import { EVENTS, type AlertChannel, type AlertEventType } from '@ecommerce/shared/constants'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { env, isEmailConfigured } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { prisma } from '../../config/prisma.js'
import { getEmailBranding } from '../../shared/email-branding.js'
import { appError, type AppError } from '../../shared/errors.js'
import { publish } from '../../shared/publish.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { isPermanentSesError, renderNotice, sendEmail } from '../../integrations/email/index.js'
import {
  classifyTelegramFailure,
  isTelegramConfigured,
  sendTelegramMessage,
  telegramFailureOf,
} from '../../integrations/telegram/index.js'
import {
  classifyWhatsAppFailure,
  isWhatsAppConfigured,
  sendWhatsAppAuthCode,
  sendWhatsAppTemplate,
  whatsAppFailureOf,
} from '../../integrations/whatsapp/index.js'
import {
  emailCodeNotice,
  renderTelegramAlert,
  renderWhatsAppAlert,
  telegramCodeMessage,
  type AlertContent,
} from './domain/render.js'

/**
 * Entrega de alertas: o fan-out na hora do fato e o envio por canal.
 *
 * O texto completo (nome e mensagem do cliente) viaja só no payload da fila; o
 * banco guarda o título do alerta e o resultado de cada entrega.
 */

export type AlertSendJob = {
  alertId: string
  destinationId: string
  /** O primeiro dá o emoji; os outros só ampliam quem assina (ex.: cancelado E estorno falhou). */
  types: AlertTypes
  content: AlertContent
}

export type AlertTypes = [AlertEventType, ...AlertEventType[]]

export type SendableDestination = {
  id: string
  channel: AlertChannel
  label: string
  address: string
}

/**
 * O resultado de um envio, na língua do negócio:
 *  - `unreachable`: o destino não recebe mais (bot bloqueado, número sem WhatsApp);
 *  - `transient`: vale tentar de novo (rede, 5xx, limite de envio);
 *  - `config`: o SERVIDOR não tem o canal (token ausente ou revogado). Nunca vira
 *    estado do destino — dev e produção dividem o banco, e um worker de dev sem
 *    token marcaria como quebrado um destino que em produção funciona;
 *  - `rejected`: o provedor recusou esta mensagem.
 */
export type SendOutcome =
  | { kind: 'sent' }
  | { kind: 'unreachable' | 'transient' | 'config' | 'rejected'; reason: string }

type FailedOutcome = Exclude<SendOutcome, { kind: 'sent' }>

const CHANNEL_SUBJECT: Record<AlertChannel, string> = {
  EMAIL: 'O envio de e-mail',
  TELEGRAM: 'O Telegram',
  WHATSAPP: 'O WhatsApp',
}

export const isChannelConfigured = (channel: AlertChannel): boolean =>
  channel === 'EMAIL' ? isEmailConfigured() : channel === 'TELEGRAM' ? isTelegramConfigured() : isWhatsAppConfigured()

export const alertsPageUrl = (): string => `${env.ADMIN_URL.replace(/\/$/, '')}/alertas`

const emailOutcome = (err: unknown): FailedOutcome =>
  isPermanentSesError(err)
    ? { kind: 'rejected', reason: 'O SES recusou o e-mail para este endereço.' }
    : { kind: 'transient', reason: 'O envio de e-mail não respondeu.' }

const telegramOutcome = (err: unknown): FailedOutcome => {
  const failure = telegramFailureOf(err)
  if (!failure) return { kind: 'transient', reason: 'Falha inesperada ao falar com o Telegram.' }

  switch (classifyTelegramFailure(failure)) {
    case 'unreachable':
      return { kind: 'unreachable', reason: 'O bot não consegue escrever neste chat (bloqueado, ou removido do grupo).' }
    case 'bad_token':
      return { kind: 'config', reason: 'O Telegram recusou o token do bot configurado no servidor.' }
    case 'transient':
    case 'migrated':
      return {
        kind: 'transient',
        reason: failure.status === 429 ? 'Limite de envio do Telegram; nova tentativa em instantes.' : 'O Telegram não respondeu.',
      }
    case 'rejected':
      return { kind: 'rejected', reason: `O Telegram recusou a mensagem: ${failure.description}` }
  }
}

const whatsAppOutcome = (err: unknown): FailedOutcome => {
  const failure = whatsAppFailureOf(err)
  if (!failure) return { kind: 'transient', reason: 'Falha inesperada ao falar com o WhatsApp.' }

  switch (classifyWhatsAppFailure(failure)) {
    case 'unreachable':
      return {
        kind: 'unreachable',
        reason:
          failure.code === 131030
            ? 'Este número não está na lista de destinatários de teste da conta da Meta.'
            : 'Este número não recebe mensagens do WhatsApp.',
      }
    case 'bad_config':
      return { kind: 'config', reason: `A conta do WhatsApp na Meta recusou o envio: ${failure.description}` }
    case 'transient':
      return { kind: 'transient', reason: 'A Meta não respondeu ou limitou o envio.' }
    case 'rejected':
      return { kind: 'rejected', reason: `A Meta recusou a mensagem: ${failure.description}` }
  }
}

const OUTCOME_OF: Record<AlertChannel, (err: unknown) => FailedOutcome> = {
  EMAIL: emailOutcome,
  TELEGRAM: telegramOutcome,
  WHATSAPP: whatsAppOutcome,
}

const attempt = async (channel: AlertChannel, send: () => Promise<void>): Promise<SendOutcome> => {
  if (!isChannelConfigured(channel)) {
    return { kind: 'config', reason: `${CHANNEL_SUBJECT[channel]} não está configurado no servidor.` }
  }
  try {
    await send()
    return { kind: 'sent' }
  } catch (err) {
    return OUTCOME_OF[channel](err)
  }
}

/**
 * Grupo que vira supergrupo troca de chat_id, e o Telegram responde o id novo na
 * recusa. O destino passa a usá-lo e a mensagem sai de novo, uma vez.
 */
const sendTelegramTo = async (destination: SendableDestination, html: string): Promise<void> => {
  try {
    await sendTelegramMessage({ chatId: destination.address, html })
  } catch (err) {
    const migrateTo = telegramFailureOf(err)?.migrateToChatId
    if (!migrateTo) throw err
    await prisma.alertDestination.updateMany({ where: { id: destination.id }, data: { address: migrateTo } })
    await sendTelegramMessage({ chatId: migrateTo, html })
  }
}

const withoutEmoji = ({ emoji: _emoji, ...notice }: AlertContent) => notice

export const sendAlertTo = (
  destination: SendableDestination,
  type: AlertEventType,
  content: AlertContent,
): Promise<SendOutcome> => {
  switch (destination.channel) {
    case 'EMAIL':
      return attempt('EMAIL', async () => {
        const branding = await getEmailBranding()
        await sendEmail({
          ...renderNotice({ branding, ...withoutEmoji(content) }),
          to: destination.address,
          tags: { template: 'alert' },
        })
      })
    case 'TELEGRAM':
      return attempt('TELEGRAM', () => sendTelegramTo(destination, renderTelegramAlert(type, content)))
    case 'WHATSAPP':
      return attempt('WHATSAPP', () =>
        sendWhatsAppTemplate({
          to: destination.address,
          template: env.WHATSAPP_ALERT_TEMPLATE,
          ...renderWhatsAppAlert(type, content, env.ADMIN_URL),
        }),
      )
  }
}

export const sendCodeTo = (destination: SendableDestination, code: string): Promise<SendOutcome> => {
  switch (destination.channel) {
    case 'EMAIL':
      return attempt('EMAIL', async () => {
        const branding = await getEmailBranding()
        const notice = emailCodeNotice({
          code,
          label: destination.label,
          storeName: branding.storeName,
          adminUrl: alertsPageUrl(),
        })
        await sendEmail({
          ...renderNotice({ branding, ...notice }),
          to: destination.address,
          tags: { template: 'alert_code' },
        })
      })
    case 'TELEGRAM':
      return attempt('TELEGRAM', async () => {
        const { storeName } = await getEmailBranding()
        await sendTelegramTo(destination, telegramCodeMessage({ code, storeName }))
      })
    case 'WHATSAPP':
      return attempt('WHATSAPP', () => sendWhatsAppAuthCode(destination.address, code))
  }
}

/** Para quem está na tela esperando (código, teste): a recusa vira erro com o motivo legível. */
export const outcomeError = (outcome: FailedOutcome): AppError =>
  outcome.kind === 'config'
    ? appError(ERROR_CODES.ALERT_CHANNEL_UNAVAILABLE, outcome.reason, 503)
    : appError(ERROR_CODES.ALERT_DELIVERY_FAILED, outcome.reason, outcome.kind === 'transient' ? 503 : 422)

/**
 * O que o envio ensina sobre o destino. `config` não escreve nada (ver
 * SendOutcome). Telegram inalcançável PAUSA: bloqueio não se desfaz sozinho, e
 * insistir a cada alerta só enche o histórico de falhas.
 */
export const recordOutcome = async (
  destination: { id: string; channel: AlertChannel },
  outcome: SendOutcome,
): Promise<void> => {
  const now = new Date()
  if (outcome.kind === 'config') return

  await prisma.alertDestination.updateMany({
    where: { id: destination.id },
    data:
      outcome.kind === 'sent'
        ? { lastSentAt: now, lastError: null, lastErrorAt: null }
        : {
            lastError: outcome.reason,
            lastErrorAt: now,
            ...(outcome.kind === 'unreachable' && destination.channel === 'TELEGRAM' ? { enabled: false } : {}),
          },
  })
}

// ── Fan-out e entrega ────────────────────────────────────────────────────────

/**
 * Um fato vira alerta: uma mensagem na fila POR DESTINO inscrito em algum dos
 * tipos (o fan-out da campanha), e o retry de um destino lento não reenvia aos
 * que já receberam. Ninguém inscrito = nem grava o alerta.
 */
export const raiseAlert = async (types: AlertTypes, content: AlertContent): Promise<void> => {
  const storeId = getActiveStoreId()
  const destinations = await prisma.alertDestination.findMany({
    where: { storeId, enabled: true, verifiedAt: { not: null }, events: { hasSome: types } },
    select: { id: true },
  })
  if (destinations.length === 0) return

  const alert = await prisma.alert.create({
    data: { storeId, type: types[0], title: content.heading },
    select: { id: true },
  })

  for (const destination of destinations) {
    const job: AlertSendJob = { alertId: alert.id, destinationId: destination.id, types, content }
    await publish(EVENTS.alert.sendRequested, job)
  }
}

/**
 * Já saiu um alerta deste tipo desde `since`? É a trava de quem manda resumo
 * periódico: o job roda de hora em hora, o resumo sai uma vez por dia. Sem
 * destino inscrito o alerta nem é gravado — e não há a quem repetir.
 */
export const alertRaisedSince = async (type: AlertEventType, since: Date): Promise<boolean> =>
  (await prisma.alert.count({ where: { storeId: getActiveStoreId(), type, createdAt: { gte: since } } })) > 0

/** Uma entrega, no worker (`alert.send`). Só a falha transitória volta para a fila. */
export const deliverAlert = async (job: AlertSendJob): Promise<void> => {
  const destination = await prisma.alertDestination.findFirst({
    where: { id: job.destinationId, storeId: getActiveStoreId() },
    select: { id: true, channel: true, label: true, address: true, enabled: true, verifiedAt: true },
  })
  // Excluído ou pausado entre o fato e a entrega: ninguém mais a avisar.
  if (!destination?.address || !destination.enabled || !destination.verifiedAt) return

  const key = { alertId_destinationId: { alertId: job.alertId, destinationId: destination.id } }
  const previous = await prisma.alertDelivery.findUnique({ where: key, select: { error: true } })
  if (previous && previous.error === null) return

  const outcome = await sendAlertTo({ ...destination, address: destination.address }, job.types[0], job.content)
  const error = outcome.kind === 'sent' ? null : outcome.reason

  await prisma.alertDelivery.upsert({
    where: key,
    create: { alertId: job.alertId, destinationId: destination.id, error },
    update: { error, attempts: { increment: 1 } },
  })
  await recordOutcome(destination, outcome)

  if (outcome.kind === 'config') {
    logger.warn({ alertId: job.alertId, channel: destination.channel }, `alerta não enviado: ${outcome.reason}`)
  }
  if (outcome.kind === 'transient') {
    throw new Error(`entrega do alerta falhou: ${outcome.reason}`)
  }
}
