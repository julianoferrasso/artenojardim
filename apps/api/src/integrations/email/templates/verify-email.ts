import type { EmailContent } from '../send.js'
import { renderEmailLayout, renderEmailText, type EmailBranding, type EmailLayoutParams } from '../layout.js'

/**
 * E-mail de confirmação de conta. Função PURA — recebe o código e a URL já
 * montados, não sabe de token nem de banco.
 *
 * Leva os DOIS: o código é para quem está com a tela do cadastro aberta (digita
 * ali e segue); o link, para quem fechou a aba e volta depois — ele confirma e
 * já entra, sem pedir login de novo. O reenvio antigo, só de link, manda sem
 * código: código a mais é tentativa a mais para quem chuta.
 */
export const renderVerifyEmail = (params: {
  branding: EmailBranding
  customerName: string
  code?: { value: string; expiresInMinutes: number } | undefined
  verifyUrl: string
  expiresInHours: number
}): EmailContent => {
  const firstName = params.customerName.trim().split(/\s+/)[0] ?? ''

  const layout: EmailLayoutParams = {
    branding: params.branding,
    heading: 'Confirme o seu e-mail',
    code: params.code?.value,
    paragraphs: [
      `Olá, ${firstName}! Falta um passo para a sua conta na ${params.branding.storeName} ficar pronta.`,
      params.code
        ? `Digite o código acima na tela do cadastro (vale por ${params.code.expiresInMinutes} minutos) — ou toque no botão para confirmar e entrar.`
        : 'Toque no botão abaixo para confirmar que este e-mail é seu e entrar.',
      `O botão vale por ${params.expiresInHours} horas.`,
    ],
    ctaLabel: 'Confirmar e entrar',
    ctaUrl: params.verifyUrl,
    footerNote:
      'Se você não criou esta conta, ignore este e-mail — nada será ativado sem essa confirmação.',
  }

  return {
    subject: params.code
      ? `${params.code.value} — confirme o seu e-mail na ${params.branding.storeName}`
      : `Confirme o seu e-mail — ${params.branding.storeName}`,
    html: renderEmailLayout(layout),
    text: renderEmailText(layout),
  }
}
