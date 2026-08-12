import type { EmailContent } from '../send.js'
import { renderEmailLayout, renderEmailText, type EmailBranding, type EmailLayoutParams } from '../layout.js'

/**
 * E-mail de confirmação de conta. Função PURA — recebe a URL já montada, não
 * sabe de token nem de banco.
 */
export const renderVerifyEmail = (params: {
  branding: EmailBranding
  customerName: string
  verifyUrl: string
  expiresInHours: number
}): EmailContent => {
  const firstName = params.customerName.trim().split(/\s+/)[0] ?? ''

  const layout: EmailLayoutParams = {
    branding: params.branding,
    heading: 'Confirme o seu e-mail',
    paragraphs: [
      `Olá, ${firstName}! Falta um passo para a sua conta na ${params.branding.storeName} ficar pronta.`,
      'Toque no botão abaixo para confirmar que este e-mail é seu e liberar o acesso.',
      `O link vale por ${params.expiresInHours} horas.`,
    ],
    ctaLabel: 'Confirmar meu e-mail',
    ctaUrl: params.verifyUrl,
    footerNote:
      'Se você não criou esta conta, ignore este e-mail — nada será ativado sem essa confirmação.',
  }

  return {
    subject: `Confirme o seu e-mail — ${params.branding.storeName}`,
    html: renderEmailLayout(layout),
    text: renderEmailText(layout),
  }
}
