import type { EmailContent } from '../send.js'
import { renderEmailLayout, renderEmailText, type EmailBranding, type EmailLayoutParams } from '../layout.js'

/**
 * E-mail de recuperação de senha. Serve tanto para quem esqueceu a senha quanto
 * para o cliente de guest checkout que nunca teve uma — daí "definir", que cobre
 * os dois casos sem revelar qual é.
 */
export const renderResetPassword = (params: {
  branding: EmailBranding
  customerName: string
  resetUrl: string
  expiresInMinutes: number
}): EmailContent => {
  const firstName = params.customerName.trim().split(/\s+/)[0] ?? ''

  const layout: EmailLayoutParams = {
    branding: params.branding,
    heading: 'Definir uma nova senha',
    paragraphs: [
      `Olá, ${firstName}. Recebemos um pedido para redefinir a senha da sua conta na ${params.branding.storeName}.`,
      'Toque no botão abaixo para escolher uma senha nova.',
      `Por segurança, o link vale por ${params.expiresInMinutes} minutos e só pode ser usado uma vez.`,
    ],
    ctaLabel: 'Criar nova senha',
    ctaUrl: params.resetUrl,
    footerNote:
      'Se não foi você que pediu, ignore este e-mail: a sua senha atual continua valendo e nada muda.',
  }

  return {
    subject: `Redefinir a sua senha — ${params.branding.storeName}`,
    html: renderEmailLayout(layout),
    text: renderEmailText(layout),
  }
}
