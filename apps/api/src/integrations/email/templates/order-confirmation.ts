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
  /** "até 12/08" ou nulo quando não há estimativa da transportadora. */
  estimatedDelivery: string | null
}): EmailContent => {
  const firstName = params.customerName.trim().split(/\s+/)[0] ?? ''

  const layout: EmailLayoutParams = {
    branding: params.branding,
    heading: `Pedido #${params.orderNumber} confirmado`,
    paragraphs: [
      `Obrigado, ${firstName}! Recebemos o seu pagamento e já estamos preparando o seu pedido.`,
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
