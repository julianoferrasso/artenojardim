import type { EmailContent } from '../send.js'
import { renderEmailLayout, renderEmailText, type EmailBranding, type EmailLayoutParams } from '../layout.js'

/**
 * Aviso enviado ao endereço ANTIGO quando uma troca de e-mail é solicitada.
 *
 * Por que ele existe: trocar o e-mail é o vetor clássico de tomada de conta a
 * partir de uma sessão roubada. Se o único aviso fosse para a caixa nova — que
 * por hipótese é do atacante — o dono legítimo só descobriria a troca no dia em
 * que não conseguisse mais entrar. Este e-mail é a ÚNICA detecção que ele tem.
 *
 * O endereço novo vem MASCARADO: quem lê talvez já não controle a conta, e o
 * endereço completo do atacante não ajuda a vítima a reagir — trocar a senha sim.
 *
 * Sem link de cancelamento com token: seria mais uma superfície de ataque, e
 * cancelar já é possível entrando na conta com a senha, que o atacante não tem.
 */
export const renderEmailChangeNotice = (params: {
  branding: EmailBranding
  customerName: string
  maskedNewEmail: string
  accountUrl: string
}): EmailContent => {
  const firstName = params.customerName.trim().split(/\s+/)[0] ?? ''

  const layout: EmailLayoutParams = {
    branding: params.branding,
    heading: 'Pedido de troca de e-mail',
    paragraphs: [
      `Olá, ${firstName}. Alguém pediu para trocar o e-mail da sua conta na ${params.branding.storeName} para ${params.maskedNewEmail}.`,
      'A troca só acontece quando o novo endereço confirmar o link que enviamos para ele. Até lá, este e-mail continua sendo o da sua conta.',
      'Se foi você, não precisa fazer nada por aqui.',
    ],
    ctaLabel: 'Revisar minha conta',
    ctaUrl: params.accountUrl,
    footerNote:
      'Se NÃO foi você, entre na sua conta e troque a senha agora — isso cancela a troca e encerra as sessões abertas. Depois, fale conosco.',
  }

  return {
    subject: `Pedido de troca de e-mail na sua conta — ${params.branding.storeName}`,
    html: renderEmailLayout(layout),
    text: renderEmailText(layout),
  }
}
