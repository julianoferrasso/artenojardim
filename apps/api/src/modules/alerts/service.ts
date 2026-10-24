import {
  ALERT_CODE_LENGTH,
  ERROR_CODES,
  type AlertDestination,
  type AlertDestinationStep,
  type AlertHistoryItem,
  type AlertSettings,
  type AlertsOverview,
  type AlertTestResult,
  type CreateAlertDestinationData,
  type TelegramLinkStatus,
  type UpdateAlertDestinationData,
} from '@ecommerce/shared/contracts'
import { DEFAULT_ALERT_EVENTS, EVENTS, type AlertChannel } from '@ecommerce/shared/constants'
import { Prisma } from '@prisma/client'
import { isEmailConfigured } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { prisma } from '../../config/prisma.js'
import { audit, diff, type AuditContext } from '../../shared/audit.js'
import { appError, businessError, conflict, isAppError, notFound } from '../../shared/errors.js'
import { getSetting, setSetting } from '../../shared/settings.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { generateNumericCode, generateOpaqueToken, hashToken, safeCompare } from '../../utils/crypto.js'
import {
  getBotUsername,
  getTelegramUpdates,
  isTelegramConfigured,
  sendTelegramMessage,
  telegramFailureOf,
  type TelegramMessageUpdate,
} from '../../integrations/telegram/index.js'
import { isWhatsAppConfigured } from '../../integrations/whatsapp/index.js'
import {
  alertsPageUrl,
  isChannelConfigured,
  outcomeError,
  recordOutcome,
  sendAlertTo,
  sendCodeTo,
  type SendableDestination,
} from './delivery.js'
import { testAlertContent } from './domain/render.js'
import { parseStartToken, telegramChatLabel, telegramStartLinks } from './domain/telegram.js'
import {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  TELEGRAM_LINK_TTL_MS,
  attemptsLeftMessage,
  codeDigestInput,
  pendingStepOf,
  resendWaitMs,
} from './domain/verification.js'

/**
 * Alertas da equipe: os destinos (cadastro, código, pausa, eventos) e o limite de
 * estoque baixo. O disparo mora em `delivery.ts`; quem tem um fato a avisar chama
 * `raiseAlert` — pelo `notify*` do módulo notifications, não direto.
 */

export { raiseAlert, deliverAlert, alertRaisedSince, type AlertSendJob, type AlertTypes } from './delivery.js'
export type { AlertContent } from './domain/render.js'

const SELECT = {
  id: true,
  channel: true,
  label: true,
  address: true,
  addressLabel: true,
  events: true,
  enabled: true,
  verifiedAt: true,
  codeExpiresAt: true,
  codeSentAt: true,
  linkExpiresAt: true,
  lastSentAt: true,
  lastError: true,
  lastErrorAt: true,
  createdAt: true,
} satisfies Prisma.AlertDestinationSelect

type Row = Prisma.AlertDestinationGetPayload<{ select: typeof SELECT }>

const iso = (date: Date | null): string | null => date?.toISOString() ?? null

const toDTO = (row: Row): AlertDestination => {
  const step = pendingStepOf(row)
  return {
    id: row.id,
    channel: row.channel,
    label: row.label,
    address: row.address,
    addressLabel: row.addressLabel,
    events: row.events,
    enabled: row.enabled,
    verified: row.verifiedAt !== null,
    pendingStep: step,
    pendingExpiresAt: iso(step === 'telegram_link' ? row.linkExpiresAt : step === 'code' ? row.codeExpiresAt : null),
    resendAvailableAt:
      step === 'code' && row.codeSentAt ? new Date(row.codeSentAt.getTime() + RESEND_COOLDOWN_MS).toISOString() : null,
    lastSentAt: iso(row.lastSentAt),
    lastError: row.lastError,
    lastErrorAt: iso(row.lastErrorAt),
    createdAt: row.createdAt.toISOString(),
  }
}

const findOwned = async (id: string): Promise<Row> => {
  const row = await prisma.alertDestination.findFirst({
    where: { id, storeId: getActiveStoreId() },
    select: SELECT,
  })
  if (!row) throw notFound('Destino')
  return row
}

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'

const alreadyRegistered = () =>
  conflict('Este destino já está cadastrado.', ERROR_CODES.ALERT_DESTINATION_EXISTS)

const CHANNEL_UNAVAILABLE: Record<AlertChannel, string> = {
  EMAIL: 'O envio de e-mail não está configurado no servidor.',
  TELEGRAM: 'O Telegram ainda não está configurado no servidor. Veja "Como configurar" na tela de Alertas.',
  WHATSAPP: 'O WhatsApp ainda não está configurado no servidor. Veja "Como configurar" na tela de Alertas.',
}

const assertChannelAvailable = (channel: AlertChannel): void => {
  if (!isChannelConfigured(channel)) {
    throw appError(ERROR_CODES.ALERT_CHANNEL_UNAVAILABLE, CHANNEL_UNAVAILABLE[channel], 503)
  }
}

const telegramProblem = (err: unknown): string => {
  const failure = telegramFailureOf(err)
  return failure && (failure.status === 401 || failure.status === 404)
    ? 'O Telegram recusou o token do bot. Confira o TELEGRAM_BOT_TOKEN.'
    : 'O Telegram não respondeu agora.'
}

/** O link do Telegram precisa do @ do bot; sem ele não há o que oferecer. */
const requireBotUsername = async (): Promise<string> => {
  try {
    return await getBotUsername()
  } catch (err) {
    throw appError(ERROR_CODES.ALERT_CHANNEL_UNAVAILABLE, telegramProblem(err), 503)
  }
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export const getAlertsOverview = async (): Promise<AlertsOverview> => {
  const telegram = isTelegramConfigured()
  const [rows, settings, bot] = await Promise.all([
    prisma.alertDestination.findMany({
      where: { storeId: getActiveStoreId() },
      select: SELECT,
      orderBy: { createdAt: 'asc' },
    }),
    getSetting('alerts'),
    telegram
      ? getBotUsername().then(
          (username) => ({ username, problem: null }),
          (err: unknown) => ({ username: null, problem: telegramProblem(err) }),
        )
      : { username: null, problem: null },
  ])

  return {
    channels: {
      EMAIL: { available: isEmailConfigured() },
      TELEGRAM: { available: telegram, botUsername: bot.username, problem: bot.problem },
      WHATSAPP: { available: isWhatsAppConfigured() },
    },
    destinations: rows.map(toDTO),
    settings,
  }
}

const HISTORY_SIZE = 50

export const listAlertHistory = async (): Promise<AlertHistoryItem[]> => {
  const rows = await prisma.alert.findMany({
    where: { storeId: getActiveStoreId() },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_SIZE,
    select: {
      id: true,
      type: true,
      title: true,
      createdAt: true,
      deliveries: {
        orderBy: { createdAt: 'asc' },
        select: {
          destinationId: true,
          error: true,
          updatedAt: true,
          destination: { select: { label: true, channel: true } },
        },
      },
    },
  })

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    deliveries: row.deliveries.map((d) => ({
      destinationId: d.destinationId,
      label: d.destination.label,
      channel: d.destination.channel,
      delivered: d.error === null,
      error: d.error,
      at: d.updatedAt.toISOString(),
    })),
  }))
}

// ── Cadastro e código ────────────────────────────────────────────────────────

/**
 * Gera, grava (só o hash) e envia um código. Envio recusado desfaz a gravação:
 * sem isso, a espera entre reenvios prenderia quem só quer tentar de novo.
 */
const issueCode = async (destination: SendableDestination, now: Date): Promise<void> => {
  const code = generateNumericCode(ALERT_CODE_LENGTH)
  const codeHash = hashToken(codeDigestInput(destination.id, code))

  await prisma.alertDestination.update({
    where: { id: destination.id },
    data: { codeHash, codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS), codeAttempts: 0, codeSentAt: now },
  })

  const outcome = await sendCodeTo(destination, code)
  if (outcome.kind === 'sent') return

  await prisma.alertDestination.updateMany({
    where: { id: destination.id, codeHash },
    data: { codeHash: null, codeExpiresAt: null, codeSentAt: null },
  })
  throw outcomeError(outcome)
}

const newTelegramLink = async (now: Date) => {
  const botUsername = await requireBotUsername()
  const token = generateOpaqueToken()
  return {
    data: { linkTokenHash: hashToken(token), linkExpiresAt: new Date(now.getTime() + TELEGRAM_LINK_TTL_MS) },
    links: telegramStartLinks(botUsername, token),
  }
}

export const createDestination = async (
  input: CreateAlertDestinationData,
  ctx: AuditContext,
): Promise<AlertDestinationStep> => {
  assertChannelAvailable(input.channel)
  const storeId = getActiveStoreId()
  const now = new Date()

  if (input.channel === 'TELEGRAM') {
    const link = await newTelegramLink(now)
    const row = await prisma.alertDestination.create({
      data: { storeId, channel: 'TELEGRAM', label: input.label, events: [...DEFAULT_ALERT_EVENTS], ...link.data },
      select: SELECT,
    })
    await auditCreated(row, ctx)
    return { destination: toDTO(row), telegramLinks: link.links }
  }

  const address = input.channel === 'EMAIL' ? input.email : input.phone
  const existing = await prisma.alertDestination.findFirst({
    where: { storeId, channel: input.channel, address },
    select: SELECT,
  })
  if (existing?.verifiedAt) throw alreadyRegistered()

  // Mesmo endereço ainda pendente: é quem cadastrou de novo porque o código não
  // chegou ou venceu. Reaproveita a linha em vez de recusar.
  let row: Row
  if (existing) {
    row = await prisma.alertDestination.update({
      where: { id: existing.id },
      data: { label: input.label },
      select: SELECT,
    })
  } else {
    try {
      row = await prisma.alertDestination.create({
        data: { storeId, channel: input.channel, label: input.label, address, events: [...DEFAULT_ALERT_EVENTS] },
        select: SELECT,
      })
    } catch (err) {
      if (isUniqueViolation(err)) throw alreadyRegistered()
      throw err
    }
    await auditCreated(row, ctx)
  }

  // O mesmo cadastro repetido em segundos não dispara um segundo código.
  if (resendWaitMs(row.codeSentAt, now) === 0) {
    await issueCode({ id: row.id, channel: row.channel, label: row.label, address }, now)
  }
  return { destination: toDTO(await findOwned(row.id)), telegramLinks: null }
}

const auditCreated = (row: Row, ctx: AuditContext): Promise<void> =>
  audit({
    action: EVENTS.alert.destinationCreated,
    entityType: 'AlertDestination',
    entityId: row.id,
    changes: {
      channel: { from: null, to: row.channel },
      label: { from: null, to: row.label },
      address: { from: null, to: row.address },
    },
    context: ctx,
  })

/** Outro código (e-mail, WhatsApp, Telegram já vinculado) ou outro link (Telegram sem chat). */
export const resendCode = async (id: string): Promise<AlertDestinationStep> => {
  const row = await findOwned(id)
  if (row.verifiedAt) throw conflict('Este destino já está confirmado.')
  assertChannelAvailable(row.channel)
  const now = new Date()

  if (!row.address) {
    const link = await newTelegramLink(now)
    await prisma.alertDestination.update({
      where: { id },
      data: { ...link.data, lastError: null, lastErrorAt: null },
    })
    return { destination: toDTO(await findOwned(id)), telegramLinks: link.links }
  }

  const wait = resendWaitMs(row.codeSentAt, now)
  if (wait > 0) {
    throw businessError(
      ERROR_CODES.ALERT_RESEND_TOO_SOON,
      `Aguarde ${Math.ceil(wait / 1000)} s para pedir outro código.`,
      429,
    )
  }

  await issueCode({ id: row.id, channel: row.channel, label: row.label, address: row.address }, now)
  return { destination: toDTO(await findOwned(id)), telegramLinks: null }
}

export const verifyCode = async (id: string, code: string, ctx: AuditContext): Promise<AlertDestination> => {
  const row = await findOwned(id)
  if (row.verifiedAt) return toDTO(row)
  const storeId = getActiveStoreId()
  const now = new Date()

  // Gasta a tentativa ANTES de comparar: duas requisições em paralelo não ganham
  // uma tentativa extra cada.
  const spent = await prisma.alertDestination.updateMany({
    where: {
      id,
      storeId,
      verifiedAt: null,
      codeHash: { not: null },
      codeExpiresAt: { gt: now },
      codeAttempts: { lt: MAX_CODE_ATTEMPTS },
    },
    data: { codeAttempts: { increment: 1 } },
  })
  if (spent.count === 0) {
    throw businessError(ERROR_CODES.ALERT_CODE_EXPIRED, 'Este código venceu. Peça um novo.', 400)
  }

  const current = await prisma.alertDestination.findFirstOrThrow({
    where: { id, storeId },
    select: { codeHash: true, codeAttempts: true },
  })
  const matches =
    current.codeHash !== null && safeCompare(current.codeHash, hashToken(codeDigestInput(id, code)))

  if (!matches) {
    const left = MAX_CODE_ATTEMPTS - current.codeAttempts
    if (left > 0) {
      throw businessError(ERROR_CODES.ALERT_CODE_INVALID, `Código incorreto. ${attemptsLeftMessage(left)}`, 400)
    }
    // Errou a última: o código morre, e só um envio novo reabre.
    await prisma.alertDestination.updateMany({
      where: { id, codeHash: current.codeHash },
      data: { codeHash: null, codeExpiresAt: null },
    })
    throw businessError(
      ERROR_CODES.ALERT_CODE_EXPIRED,
      'Código incorreto, e as tentativas acabaram. Peça um novo código.',
      400,
    )
  }

  const verified = await prisma.alertDestination.update({
    where: { id },
    data: {
      verifiedAt: now,
      enabled: true,
      codeHash: null,
      codeExpiresAt: null,
      codeAttempts: 0,
      codeSentAt: null,
      lastError: null,
      lastErrorAt: null,
    },
    select: SELECT,
  })

  await audit({
    action: EVENTS.alert.destinationVerified,
    entityType: 'AlertDestination',
    entityId: id,
    changes: { verifiedAt: { from: null, to: now.toISOString() } },
    context: ctx,
  })

  return toDTO(verified)
}

// ── Vínculo do Telegram ──────────────────────────────────────────────────────

/**
 * O painel não tem webhook: lê as mensagens do bot com `getUpdates` só enquanto
 * alguém espera o "Iniciar". Funciona em dev e em produção sem rota pública, e um
 * bot só alerta — ele não precisa ouvir nada fora do cadastro.
 */
const TELEGRAM_POLL_SECONDS = 10

/** Leitura em andamento neste processo: duas abas esperando dividem a mesma (duas dariam 409 uma na outra). */
let polling: Promise<void> | null = null

/**
 * Até onde já lemos. Em memória: num restart o Telegram reentrega o que guarda
 * (até 24 h), e o vínculo é idempotente — o token morre no primeiro uso.
 */
let nextOffset: number | undefined

const pollTelegram = (): Promise<void> => {
  polling ??= readTelegramUpdates().finally(() => {
    polling = null
  })
  return polling
}

const readTelegramUpdates = async (): Promise<void> => {
  let updates: TelegramMessageUpdate[]
  try {
    updates = await getTelegramUpdates({
      ...(nextOffset !== undefined ? { offset: nextOffset } : {}),
      timeoutSec: TELEGRAM_POLL_SECONDS,
    })
  } catch (err) {
    const failure = telegramFailureOf(err)
    if (failure?.status === 409 && /webhook/i.test(failure.description)) {
      throw appError(
        ERROR_CODES.ALERT_CHANNEL_UNAVAILABLE,
        'Este bot está com webhook ativo, e o painel lê o Telegram por getUpdates. Remova o webhook (deleteWebhook) e tente de novo.',
        409,
      )
    }
    // Outra leitura do mesmo bot em curso (outro processo): a próxima rodada pega.
    if (failure?.status === 409) return
    throw err
  }

  for (const update of updates) {
    await linkTelegramChat(update).catch((err: unknown) =>
      logger.error({ err, updateId: update.updateId }, 'falha ao vincular chat do Telegram'),
    )
  }
  if (updates.length > 0) nextOffset = Math.max(...updates.map((u) => u.updateId)) + 1
}

const errorMessageOf = (err: unknown): string => (isAppError(err) ? err.message : 'erro inesperado')

/** `/start <token>` de um link válido: o chat vira o endereço do destino e recebe o código. */
const linkTelegramChat = async (update: TelegramMessageUpdate): Promise<void> => {
  const token = parseStartToken(update.text)
  const chat = update.chat
  if (!token || !chat) return

  const tokenHash = hashToken(token)
  const now = new Date()
  const target = await prisma.alertDestination.findFirst({
    where: { storeId: getActiveStoreId(), linkTokenHash: tokenHash },
    select: { id: true, label: true, linkExpiresAt: true },
  })
  if (!target) return

  if (!target.linkExpiresAt || target.linkExpiresAt <= now) {
    await sendTelegramMessage({
      chatId: chat.id,
      html: 'Este link de cadastro expirou. Gere um novo no painel da loja, na tela Alertas.',
    }).catch(() => {})
    return
  }

  let bound: number
  try {
    // A condição é a trava: dev e produção (ou duas abas) lendo o mesmo /start,
    // só um vincula — e só esse manda o código.
    const result = await prisma.alertDestination.updateMany({
      where: { id: target.id, linkTokenHash: tokenHash, address: null, verifiedAt: null },
      data: { address: chat.id, addressLabel: telegramChatLabel(chat), linkTokenHash: null, linkExpiresAt: null },
    })
    bound = result.count
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    await prisma.alertDestination.updateMany({
      where: { id: target.id },
      data: { lastError: 'Este chat já é um destino cadastrado. Use outro chat ou exclua este cadastro.', lastErrorAt: now },
    })
    await sendTelegramMessage({ chatId: chat.id, html: 'Este chat já recebe os alertas da loja.' }).catch(() => {})
    return
  }
  if (bound === 0) return

  try {
    await issueCode({ id: target.id, channel: 'TELEGRAM', label: target.label, address: chat.id }, now)
  } catch (err) {
    await prisma.alertDestination.updateMany({
      where: { id: target.id },
      data: { lastError: `Não consegui mandar o código neste chat: ${errorMessageOf(err)}`, lastErrorAt: now },
    })
  }
}

const linkState = (row: Row, now: Date): TelegramLinkStatus['state'] => {
  if (row.verifiedAt) return 'verified'
  if (row.address) return 'code_sent'
  return row.linkExpiresAt && row.linkExpiresAt > now ? 'waiting' : 'expired'
}

/** A tela chama em sequência enquanto espera o "Iniciar"; cada chamada segura até 10 s. */
export const syncTelegramLink = async (id: string): Promise<TelegramLinkStatus> => {
  const before = await findOwned(id)
  if (before.channel !== 'TELEGRAM') {
    throw businessError(ERROR_CODES.VALIDATION_ERROR, 'Só destinos do Telegram têm vínculo de chat.', 400)
  }

  if (linkState(before, new Date()) !== 'waiting') {
    return { state: linkState(before, new Date()), destination: toDTO(before) }
  }

  assertChannelAvailable('TELEGRAM')
  await pollTelegram()
  const row = await findOwned(id)
  return { state: linkState(row, new Date()), destination: toDTO(row) }
}

// ── Gestão ───────────────────────────────────────────────────────────────────

export const updateDestination = async (
  id: string,
  input: UpdateAlertDestinationData,
  ctx: AuditContext,
): Promise<AlertDestination> => {
  const before = await findOwned(id)
  const reactivating = input.enabled === true && !before.enabled

  const row = await prisma.alertDestination.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.events !== undefined ? { events: input.events } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      // Reativar zera o erro que pausou (ex.: bot bloqueado): a próxima entrega diz se voltou.
      ...(reactivating ? { lastError: null, lastErrorAt: null } : {}),
    },
    select: SELECT,
  })

  const changes = diff(
    { label: before.label, events: before.events, enabled: before.enabled },
    { label: row.label, events: row.events, enabled: row.enabled },
  )
  if (Object.keys(changes).length > 0) {
    await audit({
      action: EVENTS.alert.destinationUpdated,
      entityType: 'AlertDestination',
      entityId: id,
      changes,
      context: ctx,
    })
  }

  return toDTO(row)
}

export const deleteDestination = async (id: string, ctx: AuditContext): Promise<void> => {
  const row = await findOwned(id)
  await prisma.alertDestination.delete({ where: { id } })
  await audit({
    action: EVENTS.alert.destinationDeleted,
    entityType: 'AlertDestination',
    entityId: id,
    changes: {
      channel: { from: row.channel, to: null },
      label: { from: row.label, to: null },
      address: { from: row.address, to: null },
    },
    context: ctx,
  })
}

/** Na hora, sem fila: quem clicou quer saber já se chegou — ou por que não. */
export const sendTestAlert = async (id: string): Promise<AlertTestResult> => {
  const row = await findOwned(id)
  if (!row.verifiedAt || !row.address) {
    throw businessError(ERROR_CODES.ALERT_NOT_VERIFIED, 'Confirme o destino com o código antes de enviar um teste.', 409)
  }

  const destination = { id: row.id, channel: row.channel, label: row.label, address: row.address }
  const content = testAlertContent({ label: row.label, events: row.events, alertsUrl: alertsPageUrl() })
  const outcome = await sendAlertTo(destination, 'ORDER_PAID', content)
  await recordOutcome(destination, outcome)
  if (outcome.kind !== 'sent') throw outcomeError(outcome)

  return { sentTo: row.addressLabel ?? row.address }
}

export const updateAlertSettings = async (input: AlertSettings, ctx: AuditContext): Promise<AlertSettings> => {
  const before = await getSetting('alerts')
  await setSetting('alerts', input)

  const changes = diff(before, input)
  if (Object.keys(changes).length > 0) {
    await audit({
      action: EVENTS.alert.settingsUpdated,
      entityType: 'Store',
      entityId: getActiveStoreId(),
      changes,
      context: ctx,
    })
  }
  return input
}
