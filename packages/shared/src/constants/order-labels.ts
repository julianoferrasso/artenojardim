import type {
  PaymentStatus,
  FulfillmentStatus,
  PaymentMethod,
  PaymentProvider,
} from './enums.js'
// `import type` de propósito: contracts/ já importa de constants/, e um import
// de valor aqui fecharia um ciclo em runtime. Tipo é apagado na compilação.
import type { OrderSituation } from '../contracts/order-situation.js'
import type { OrderPeriod, CustomerCancelReason } from '../contracts/customer-orders.js'
import type { SupportTopic } from '../contracts/support.js'
import type { SupportThreadStatus } from './enums.js'

/**
 * Como cada estado de pedido se chama em português — para a loja E para o admin.
 *
 * Ficava só em `apps/admin/src/lib/order-labels.ts`. Passou para cá quando a
 * área do cliente nasceu: dois arquivos de rótulo viram, em três meses, um
 * pedido "Recusado" no painel e "Pagamento não aprovado" na conta do cliente —
 * que liga para o suporte perguntando se são dois problemas diferentes.
 *
 * Só TEXTO. As classes de cor continuam por app: paleta é apresentação, e a
 * loja pode querer um tom mais suave que o painel.
 */

export const SITUATION_LABEL: Record<OrderSituation, string> = {
  AWAITING_PAYMENT: 'Aguardando Pagamento',
  PAYMENT_FAILED: 'Pagamento Recusado',
  PAID: 'Pago',
  IN_PRODUCTION: 'Em Produção',
  PICKING: 'Em Separação',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  RETURNED: 'Devolvido',
  CANCELED: 'Cancelado',
  REFUNDED: 'Reembolsado',
}

/** Ordem do filtro = fluxo operacional, não alfabética. */
export const SITUATION_ORDER: readonly OrderSituation[] = [
  'AWAITING_PAYMENT',
  'PAID',
  'IN_PRODUCTION',
  'PICKING',
  'SHIPPED',
  'DELIVERED',
  'PAYMENT_FAILED',
  'RETURNED',
  'CANCELED',
  'REFUNDED',
]

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Aguardando pagamento',
  PROCESSING: 'Processando',
  PAID: 'Pago',
  FAILED: 'Recusado',
  REFUNDED: 'Reembolsado',
  PARTIALLY_REFUNDED: 'Parcialmente reembolsado',
}

export const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  UNFULFILLED: 'Aguardando separação',
  PICKING: 'Em separação',
  READY_TO_SHIP: 'Pronto para envio',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  RETURNED: 'Devolvido',
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CARD: 'Cartão de crédito',
  PIX: 'Pix',
  BOLETO: 'Boleto',
}

export const PAYMENT_PROVIDER_LABEL: Record<PaymentProvider, string> = {
  STRIPE: 'Stripe',
  MERCADO_PAGO: 'Mercado Pago',
}

export const PERIOD_LABEL: Record<OrderPeriod, string> = {
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 3 meses',
  '6m': 'Últimos 6 meses',
  '1y': 'Último ano',
  all: 'Todo o período',
}

export const SUPPORT_TOPIC_LABEL: Record<SupportTopic, string> = {
  DELIVERY: 'Entrega',
  PAYMENT: 'Pagamento',
  PRODUCT: 'Produto',
  CANCELLATION: 'Cancelamento',
  RETURN: 'Devolução / arrependimento',
  OTHER: 'Outro assunto',
}

export const SUPPORT_THREAD_STATUS_LABEL: Record<SupportThreadStatus, string> = {
  OPEN: 'Aguardando resposta',
  ANSWERED: 'Respondida',
  CLOSED: 'Encerrada',
}

export const CANCEL_REASON_LABEL: Record<CustomerCancelReason, string> = {
  CHANGED_MIND: 'Desisti da compra',
  ORDERED_BY_MISTAKE: 'Comprei por engano',
  WRONG_ADDRESS_OR_ITEM: 'Quero mudar o endereço ou os itens',
  FOUND_BETTER_PRICE: 'Encontrei um preço melhor',
  DELIVERY_TOO_SLOW: 'O prazo de entrega ficou longo',
  PAYMENT_ISSUE: 'Problema com o pagamento',
  OTHER: 'Outro motivo',
}

/**
 * Quando o estorno aparece para o cliente, por meio de pagamento. Um texto só
 * para a loja e para o e-mail: o prazo que a tela promete é o que o e-mail repete.
 */
export const REFUND_TIMING_LABEL: Record<PaymentMethod, string> = {
  PIX: 'O valor volta para a conta que fez o Pix, normalmente em instantes (até 1 dia útil).',
  CARD: 'O estorno aparece na fatura do cartão atual ou na seguinte, conforme a data de fechamento.',
  BOLETO: 'O valor é devolvido em até 10 dias úteis.',
}
