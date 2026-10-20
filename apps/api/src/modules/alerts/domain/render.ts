import { ALERT_EVENT_CATALOG, type AlertEventType } from '@ecommerce/shared/constants'
import type { NoticeContent } from '../../../integrations/email/index.js'
import { CODE_TTL_MS } from './verification.js'

/**
 * O mesmo alerta em três formatos. O texto nasce uma vez (NoticeContent, o
 * mesmo dos avisos por e-mail) e cada canal recorta do jeito que aceita:
 *  - e-mail: o layout da loja, inteiro;
 *  - Telegram: HTML curto com emoji, escapado, abaixo dos 4096 caracteres;
 *  - WhatsApp: os parâmetros do template, que a Meta recusa com quebra de linha.
 */

/** `emoji` troca o do tipo quando o mesmo evento tem dois sentidos (a loja caiu / voltou). */
export type AlertContent = NoticeContent & { emoji?: string }

export const ALERT_EMOJI: Record<AlertEventType, string> = {
  ORDER_PAID: '🛒',
  CANCELLATION_REQUESTED: '⚠️',
  ORDER_CANCELED_BY_CUSTOMER: '↩️',
  REFUND_FAILED: '💸',
  ORDER_CREATED: '🕓',
  CUSTOMER_MESSAGE: '💬',
  LOW_STOCK: '📦',
  SHIPPING_DISCONNECTED: '🚚',
  SITE_DOWN: '🔴',
}

const truncate = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`

export const escapeTelegramHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * O limite do Telegram (4096) conta o texto JÁ renderizado, sem as tags — então
 * cortar o corpo em 3500 antes de escapar sobra espaço para título e link.
 */
const TELEGRAM_BODY_MAX = 3500

export const renderTelegramAlert = (type: AlertEventType, c: AlertContent): string => {
  const title = `${c.emoji ?? ALERT_EMOJI[type]} <b>${escapeTelegramHtml(truncate(c.heading, 200))}</b>`
  const body = escapeTelegramHtml(truncate(c.paragraphs.join('\n'), TELEGRAM_BODY_MAX))
  const link = `<a href="${escapeTelegramHtml(c.ctaUrl)}">${escapeTelegramHtml(c.ctaLabel)}</a>`
  return [title, body, link].filter(Boolean).join('\n\n')
}

/**
 * Parâmetro de template da Meta: sem quebra de linha, sem tab e sem mais de 4
 * espaços seguidos (erro 132018). As linhas viram " · ".
 */
export const toTemplateParam = (text: string, max: number): string =>
  truncate(
    text
      .split(/[\r\n\t]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' · ')
      .replace(/ {4,}/g, '   '),
    max,
  )

/**
 * O botão do template `alerta_loja` é uma URL dinâmica `ADMIN_URL/{{1}}`: aqui
 * vai só o caminho. Link que não é do painel cai na tela de Alertas.
 */
export const adminPathOf = (url: string, adminUrl: string): string => {
  const base = `${adminUrl.replace(/\/$/, '')}/`
  const path = url.startsWith(base) ? url.slice(base.length) : ''
  return path || 'alertas'
}

export const renderWhatsAppAlert = (
  type: AlertEventType,
  c: AlertContent,
  adminUrl: string,
): { bodyParams: [string, string]; buttonUrlParam: string } => ({
  bodyParams: [
    toTemplateParam(`${c.emoji ?? ALERT_EMOJI[type]} ${c.heading}`, 120),
    toTemplateParam(c.paragraphs.join('\n'), 600),
  ],
  buttonUrlParam: adminPathOf(c.ctaUrl, adminUrl),
})

// ── Código de verificação e teste ────────────────────────────────────────────

const CODE_TTL_MINUTES = CODE_TTL_MS / 60_000

export const emailCodeNotice = (p: {
  code: string
  label: string
  storeName: string
  adminUrl: string
}): NoticeContent => ({
  subject: `${p.code} é o seu código de verificação — ${p.storeName}`,
  heading: `Seu código: ${p.code}`,
  paragraphs: [
    `Digite este código no painel da loja, na tela Alertas, para que "${p.label}" passe a receber os alertas neste e-mail.`,
    `Ele vale por ${CODE_TTL_MINUTES} minutos.`,
  ],
  ctaLabel: 'Abrir o painel',
  ctaUrl: p.adminUrl,
  footerNote: 'Não pediu isto? Ignore este e-mail: sem o código, nenhum alerta é ativado.',
})

export const telegramCodeMessage = (p: { code: string; storeName: string }): string =>
  [
    `🔐 <b>${escapeTelegramHtml(p.storeName)}: código de verificação</b>`,
    '',
    `Seu código é <code>${p.code}</code>`,
    `Digite-o no painel da loja, na tela Alertas, para ativar os alertas neste chat. Ele vale por ${CODE_TTL_MINUTES} minutos.`,
  ].join('\n')

export const testAlertContent = (p: {
  label: string
  events: readonly AlertEventType[]
  alertsUrl: string
}): AlertContent => ({
  subject: '[Teste] Alertas da loja',
  heading: 'Alerta de teste',
  paragraphs: [
    `Se esta mensagem chegou, os alertas estão funcionando em "${p.label}".`,
    p.events.length > 0
      ? `Este destino recebe: ${p.events.map((type) => ALERT_EVENT_CATALOG[type].label).join(', ')}.`
      : 'Nenhum evento marcado ainda: escolha na tela Alertas.',
  ],
  ctaLabel: 'Abrir os alertas',
  ctaUrl: p.alertsUrl,
  footerNote: 'Mensagem de teste, enviada pelo botão "Enviar teste" do painel.',
  emoji: '✅',
})
