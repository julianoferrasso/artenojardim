import type { EmailContent } from '../send.js'
import {
  renderEmailLayout,
  renderEmailText,
  type EmailBranding,
  type EmailLayoutParams,
} from '../layout.js'

/**
 * Confirmação de pedido pago. Função PURA: recebe tudo já formatado — valores em
 * texto, prazo em texto — e não sabe de centavos, de fuso nem de banco.
 *
 * NÃO leva link de descadastro, e a ausência é deliberada: isto é transacional.
 * Ninguém "sai da lista" de saber que o próprio pedido foi pago, e oferecer isso
 * num e-mail obrigatório treina o cliente a marcar spam.
 */
export const renderOrderConfirmation = (params: {
  branding: EmailBranding
  orderNumber: number
  customerName: string
  orderUrl: string
  items: Array<{ label: string; qty: number; price: string }>
  /** Subtotal, frete, desconto e total — já formatados, na ordem de exibição. */
  totals: Array<{ label: string; value: string; strong?: boolean }>
  /** Uma linha só: "Rua X, 123 — Bairro, Cidade/UF". */
  shippingAddress: string
  /** "até sáb., 14 de nov." ou nulo quando não há estimativa da transportadora. */
  estimatedDelivery: string | null
  /** "até qua., 4 de nov." quando há item sob encomenda; nulo se é tudo pronta entrega. */
  productionDue: string | null
}): EmailContent => {
  const firstName = params.customerName.trim().split(/\s+/)[0] ?? ''

  const layout: EmailLayoutParams = {
    branding: params.branding,
    heading: `Pedido #${params.orderNumber} confirmado`,
    paragraphs: [
      params.productionDue
        ? `Obrigado, ${firstName}! Recebemos o seu pagamento e já vamos começar a produzir a sua encomenda: ela fica pronta ${params.productionDue}, e então enviamos o pedido completo.`
        : `Obrigado, ${firstName}! Recebemos o seu pagamento e já estamos preparando o seu pedido.`,
      `Entrega em: ${params.shippingAddress}.`,
      ...(params.estimatedDelivery
        ? [`Previsão de entrega: ${params.estimatedDelivery}.`]
        : []),
      'Avisaremos por e-mail assim que ele for despachado.',
    ],
    lineItems: { rows: params.items, totals: params.totals },
    ctaLabel: 'Acompanhar meu pedido',
    ctaUrl: params.orderUrl,
    footerNote:
      'Precisa de ajuda com este pedido? Responda a este e-mail ou fale com a gente pela sua conta na loja.',
  }

  return {
    subject: `Pedido #${params.orderNumber} confirmado — ${params.branding.storeName}`,
    html: renderEmailLayout(layout),
    text: renderEmailText(layout),
  }
}
