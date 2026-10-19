import type { EmailContent } from '../send.js'
import { renderEmailLayout, renderEmailText, type EmailBranding } from '../layout.js'

/**
 * Aviso transacional de texto livre: cancelamento, estorno, resposta do
 * atendimento, alerta para a equipe. O conteúdo chega pronto — quem decide o que
 * dizer é a API (`modules/notifications`), que conhece o pedido; aqui só se
 * aplica a casca visual.
 */
export type NoticeContent = {
  subject: string
  heading: string
  paragraphs: string[]
  ctaLabel: string
  ctaUrl: string
  footerNote: string
}

export const renderNotice = (params: { branding: EmailBranding } & NoticeContent): EmailContent => {
  const layout = {
    branding: params.branding,
    heading: params.heading,
    paragraphs: params.paragraphs,
    ctaLabel: params.ctaLabel,
    ctaUrl: params.ctaUrl,
    footerNote: params.footerNote,
  }

  return {
    subject: params.subject,
    html: renderEmailLayout(layout),
    text: renderEmailText(layout),
  }
}
