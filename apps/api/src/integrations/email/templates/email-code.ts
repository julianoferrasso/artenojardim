import type { EmailContent } from '../send.js'
import { renderEmailLayout, renderEmailText, type EmailBranding, type EmailLayoutParams } from '../layout.js'

/**
 * E-mail do código de 6 dígitos (checkout, "entrar com código"). Função PURA.
 *
 * Sem botão de propósito: o cliente está no meio de uma compra numa aba, e um
 * link abriria no navegador do app de e-mail, longe do carrinho. O código vai
 * no ASSUNTO para ser lido na própria notificação, sem abrir o e-mail.
 */
export const renderEmailCode = (params: {
  branding: EmailBranding
  code: string
  expiresInMinutes: number
}): EmailContent => {
  const layout: EmailLayoutParams = {
    branding: params.branding,
    heading: 'Seu código de acesso',
    code: params.code,
    paragraphs: [
      `Digite este código na página da ${params.branding.storeName} para confirmar que o e-mail é seu e continuar.`,
      `Ele vale por ${params.expiresInMinutes} minutos. A loja nunca pede este código por telefone, WhatsApp ou mensagem.`,
    ],
    footerNote: 'Não foi você? Ignore este e-mail: sem o código, ninguém entra na sua conta.',
  }

  return {
    subject: `${params.code} é o seu código — ${params.branding.storeName}`,
    html: renderEmailLayout(layout),
    text: renderEmailText(layout),
  }
}
