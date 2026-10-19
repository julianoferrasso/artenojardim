import {
  REFUND_TIMING_LABEL,
  SUPPORT_TOPIC_LABEL,
  type PaymentMethod,
} from '@ecommerce/shared/constants'
import type { SupportTopic } from '@ecommerce/shared/contracts'
import type { NoticeContent } from '../../../integrations/email/index.js'
import type { AutoRefundOutcome } from '../../payments/domain/refund.js'
import { formatBRL } from '../../../utils/money.js'

/**
 * O TEXTO de cada aviso por e-mail, em funções puras: recebem o que o service
 * leu do banco e devolvem assunto, parágrafos e botão. Testáveis sem fila e sem
 * SES — e é aqui que se muda uma frase.
 *
 * Dois públicos: o cliente (tom de loja, nunca texto interno) e a equipe (direto,
 * com o que pede ação no assunto, para chamar atenção na caixa de entrada).
 */

export type NoticeOrder = {
  number: number
  customerName: string
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? ''

const hello = (order: NoticeOrder): string => {
  const name = firstName(order.customerName)
  return name ? `Olá, ${name}.` : 'Olá.'
}

/** Quebra o texto digitado em parágrafos: o layout escapa e envolve cada um em <p>. */
export const toParagraphs = (body: string): string[] =>
  body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

const refundTiming = (method: PaymentMethod | null): string =>
  method ? REFUND_TIMING_LABEL[method] : 'O valor volta pelo mesmo meio usado no pagamento.'

const CUSTOMER_FOOTER =
  'Ficou alguma dúvida? Fale com a gente pela página do pedido, na sua conta da loja.'

const STAFF_FOOTER = 'Aviso automático da loja. Responda pelo painel: respostas a este e-mail não chegam ao cliente.'

// ── Cliente ──────────────────────────────────────────────────────────────────

/**
 * Confirmação do cancelamento. O Decreto 7.962 pede confirmação IMEDIATA de que
 * o pedido do consumidor foi recebido — é este e-mail.
 */
export const customerCanceledNotice = (p: {
  order: NoticeOrder
  by: 'customer' | 'store'
  refund: AutoRefundOutcome
  orderUrl: string
}): NoticeContent => {
  const opening =
    p.by === 'customer'
      ? `${hello(p.order)} Confirmamos o cancelamento do pedido #${p.order.number}, como você pediu.`
      : `${hello(p.order)} Aprovamos o seu pedido de cancelamento: o pedido #${p.order.number} foi cancelado.`

  const refund =
    p.refund.status === 'requested'
      ? [
          `O estorno de ${formatBRL(p.refund.amount)} já foi solicitado.`,
          refundTiming(p.refund.method),
        ]
      : p.refund.status === 'failed'
        ? [
            `O estorno de ${formatBRL(p.refund.amount)} está em processamento.`,
            'Avisaremos por e-mail assim que ele for concluído.',
          ]
        : ['Como o pagamento não chegou a ser feito, não há nada a estornar.']

  return {
    subject: `Pedido #${p.order.number} cancelado`,
    heading: 'Pedido cancelado',
    paragraphs: [opening, ...refund],
    ctaLabel: 'Ver o pedido',
    ctaUrl: p.orderUrl,
    footerNote: CUSTOMER_FOOTER,
  }
}

export const customerCancelRequestNotice = (p: {
  order: NoticeOrder
  refundAmount: number
  orderUrl: string
}): NoticeContent => ({
  subject: `Recebemos o pedido de cancelamento do #${p.order.number}`,
  heading: 'Pedido de cancelamento recebido',
  paragraphs: [
    `${hello(p.order)} Recebemos o seu pedido para cancelar o pedido #${p.order.number}.`,
    'Como ele já estava sendo separado, nossa equipe vai analisar e responder em até 1 dia útil.',
    ...(p.refundAmount > 0
      ? [`Se o cancelamento for aprovado, o estorno de ${formatBRL(p.refundAmount)} é feito automaticamente.`]
      : []),
  ],
  ctaLabel: 'Acompanhar o pedido',
  ctaUrl: p.orderUrl,
  footerNote: CUSTOMER_FOOTER,
})

export const customerRefundedNotice = (p: {
  order: NoticeOrder
  amount: number
  method: PaymentMethod | null
  orderUrl: string
}): NoticeContent => ({
  subject: `Estorno do pedido #${p.order.number}`,
  heading: 'Estorno solicitado',
  paragraphs: [
    `${hello(p.order)} Solicitamos o estorno de ${formatBRL(p.amount)} referente ao pedido #${p.order.number}.`,
    refundTiming(p.method),
  ],
  ctaLabel: 'Ver o pedido',
  ctaUrl: p.orderUrl,
  footerNote: CUSTOMER_FOOTER,
})

export const customerReplyNotice = (p: {
  order: NoticeOrder
  body: string
  kind: 'reply' | 'cancel_declined'
  orderUrl: string
}): NoticeContent => ({
  subject:
    p.kind === 'cancel_declined'
      ? `Sobre o cancelamento do pedido #${p.order.number}`
      : `Resposta sobre o pedido #${p.order.number}`,
  heading: p.kind === 'cancel_declined' ? 'Sobre o seu pedido de cancelamento' : 'Respondemos a sua mensagem',
  paragraphs: [
    p.kind === 'cancel_declined'
      ? `${hello(p.order)} Analisamos o seu pedido de cancelamento do #${p.order.number} e não foi possível aprová-lo:`
      : `${hello(p.order)} Respondemos a sua mensagem sobre o pedido #${p.order.number}:`,
    ...toParagraphs(p.body),
  ],
  ctaLabel: 'Ver a conversa',
  ctaUrl: p.orderUrl,
  footerNote: 'Para continuar a conversa, responda pela página do pedido — assim a resposta fica junto do histórico.',
})

// ── Equipe ───────────────────────────────────────────────────────────────────

export const staffMessageNotice = (p: {
  order: NoticeOrder
  topic: SupportTopic | null
  body: string
  threadUrl: string
}): NoticeContent => ({
  subject: `[Atendimento] Pedido #${p.order.number} — mensagem de ${p.order.customerName}`,
  heading: `Mensagem sobre o pedido #${p.order.number}`,
  paragraphs: [
    `${p.order.customerName} escreveu${p.topic ? ` (assunto: ${SUPPORT_TOPIC_LABEL[p.topic]})` : ''}:`,
    ...toParagraphs(p.body),
  ],
  ctaLabel: 'Responder no painel',
  ctaUrl: p.threadUrl,
  footerNote: STAFF_FOOTER,
})

export const staffCanceledNotice = (p: {
  order: NoticeOrder
  reason: string
  refund: AutoRefundOutcome
  orderUrl: string
}): NoticeContent => {
  const failed = p.refund.status === 'failed'
  const refund =
    p.refund.status === 'requested'
      ? `Estorno automático de ${formatBRL(p.refund.amount)} solicitado ao provedor.`
      : p.refund.status === 'failed'
        ? `O estorno automático de ${formatBRL(p.refund.amount)} foi RECUSADO pelo provedor. Reembolse pelo painel (botão Reembolsar no pedido).`
        : 'Pedido sem pagamento: nada a estornar. A reserva de estoque foi liberada.'

  return {
    subject: failed
      ? `[Ação necessária] Pedido #${p.order.number} cancelado — estorno falhou`
      : `[Cancelamento] Pedido #${p.order.number} cancelado pelo cliente`,
    heading: `Pedido #${p.order.number} cancelado pelo cliente`,
    paragraphs: [`${p.order.customerName} cancelou o pedido. Motivo: ${p.reason}`, refund],
    ctaLabel: 'Abrir o pedido',
    ctaUrl: p.orderUrl,
    footerNote: STAFF_FOOTER,
  }
}

export const staffCancelRequestNotice = (p: {
  order: NoticeOrder
  reason: string
  threadUrl: string
}): NoticeContent => ({
  subject: `[Ação necessária] Pedido #${p.order.number} — cliente pediu cancelamento`,
  heading: `Pedido de cancelamento do #${p.order.number}`,
  paragraphs: [
    `${p.order.customerName} pediu para cancelar um pedido que já está em separação. Motivo: ${p.reason}`,
    'Aprovar cancela o pedido e estorna o pagamento automaticamente. Recusar exige uma explicação, que vai para o cliente.',
  ],
  ctaLabel: 'Decidir no painel',
  ctaUrl: p.threadUrl,
  footerNote: STAFF_FOOTER,
})

export const staffRefundFailedNotice = (p: {
  order: NoticeOrder
  amount: number
  orderUrl: string
}): NoticeContent => ({
  subject: `[Ação necessária] Estorno do pedido #${p.order.number} falhou`,
  heading: `Estorno do pedido #${p.order.number} falhou`,
  paragraphs: [
    `O pagamento do pedido #${p.order.number} chegou depois do cancelamento, e o estorno automático de ${formatBRL(p.amount)} foi recusado pelo provedor.`,
    'Causas comuns: saldo insuficiente ou dinheiro ainda não liberado na conta. Reembolse pelo painel (botão Reembolsar no pedido).',
  ],
  ctaLabel: 'Abrir o pedido',
  ctaUrl: p.orderUrl,
  footerNote: STAFF_FOOTER,
})

export const staffTestNotice = (p: { adminUrl: string }): NoticeContent => ({
  subject: '[Teste] Notificações da loja',
  heading: 'Notificações configuradas',
  paragraphs: [
    'Este é um e-mail de teste. Se você o recebeu, os avisos da loja estão chegando neste endereço.',
    'Aqui chegam: mensagens de clientes, cancelamentos, pedidos de cancelamento e estornos que falharem.',
  ],
  ctaLabel: 'Abrir o painel',
  ctaUrl: p.adminUrl,
  footerNote: STAFF_FOOTER,
})
