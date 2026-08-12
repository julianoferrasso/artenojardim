import type { EmailContent } from '../send.js'
import { renderEmailLayout, renderEmailText, type EmailBranding, type EmailLayoutParams } from '../layout.js'

/**
 * Link que efetiva a troca de e-mail, enviado ao endereço NOVO. Função PURA —
 * recebe a URL já montada, não sabe de token nem de banco.
 *
 * Vai só para o endereço novo: é ele que precisa provar que existe e que o
 * cliente o acessa. O endereço antigo recebe outro e-mail, de aviso
 * (`renderEmailChangeNotice`), sem link de ação.
 */
export const renderConfirmEmailChange = (params: {
  branding: EmailBranding
  customerName: string
  newEmail: string
  confirmUrl: string
  expiresInHours: number
}): EmailContent => {
  const firstName = params.customerName.trim().split(/\s+/)[0] ?? ''

  const layout: EmailLayoutParams = {
    branding: params.branding,
    heading: 'Confirme o seu novo e-mail',
    paragraphs: [
      `Olá, ${firstName}! Você pediu para passar a usar ${params.newEmail} na sua conta da ${params.branding.storeName}.`,
      'Toque no botão abaixo para confirmar que este endereço é seu. Até lá, o seu e-mail atual continua valendo normalmente.',
      `O link vale por ${params.expiresInHours} horas.`,
    ],
    ctaLabel: 'Confirmar novo e-mail',
    ctaUrl: params.confirmUrl,
    footerNote:
      'Se não foi você que pediu esta troca, ignore este e-mail — nada muda sem essa confirmação.',
  }

  return {
    subject: `Confirme o seu novo e-mail — ${params.branding.storeName}`,
    html: renderEmailLayout(layout),
    text: renderEmailText(layout),
  }
}
