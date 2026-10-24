import { ALERT_EVENT_TYPES, type AlertChannel, type AlertEventType } from './enums.js'

/**
 * O que cada alerta significa, em português — a tela de Alertas lista daqui, e
 * a API usa `defaultOn` para os eventos com que um destino novo nasce.
 */

export const ALERT_EVENT_GROUPS = ['orders', 'support', 'stock', 'system'] as const
export type AlertEventGroup = (typeof ALERT_EVENT_GROUPS)[number]

export const ALERT_EVENT_GROUP_LABEL: Record<AlertEventGroup, string> = {
  orders: 'Pedidos',
  support: 'Atendimento',
  stock: 'Estoque',
  system: 'Sistema',
}

export type AlertEventInfo = {
  label: string
  description: string
  group: AlertEventGroup
  /** Marcado para todo destino novo. Desligado = só quem escolher recebe. */
  defaultOn: boolean
}

export const ALERT_EVENT_CATALOG: Record<AlertEventType, AlertEventInfo> = {
  ORDER_PAID: {
    label: 'Novo pedido pago',
    description: 'O pagamento foi confirmado: é hora de separar o pedido.',
    group: 'orders',
    defaultOn: true,
  },
  CANCELLATION_REQUESTED: {
    label: 'Pedido de cancelamento',
    description:
      'O cliente pediu para cancelar um pedido já em separação ou uma encomenda já em produção. A loja aprova ou recusa.',
    group: 'orders',
    defaultOn: true,
  },
  ORDER_CANCELED_BY_CUSTOMER: {
    label: 'Cancelado pelo cliente',
    description: 'O cliente cancelou antes da separação; o estorno saiu automático.',
    group: 'orders',
    defaultOn: true,
  },
  REFUND_FAILED: {
    label: 'Estorno falhou',
    description: 'O provedor recusou um estorno automático (ex.: sem saldo). Reembolse pelo painel.',
    group: 'orders',
    defaultOn: true,
  },
  ORDER_CREATED: {
    label: 'Pedido aguardando pagamento',
    description: 'O cliente fechou o pedido, mas o Pix ou o cartão ainda não foram pagos.',
    group: 'orders',
    defaultOn: false,
  },
  PRODUCTION_DUE: {
    label: 'Encomenda no prazo',
    description:
      'Resumo diário, às 8h dos dias úteis: encomendas que vencem o prazo de produção no próximo dia útil ou já atrasaram.',
    group: 'orders',
    defaultOn: true,
  },
  CUSTOMER_MESSAGE: {
    label: 'Mensagem de cliente',
    description: 'Mensagem nova na conversa de um pedido, inclusive pedido de devolução.',
    group: 'support',
    defaultOn: true,
  },
  LOW_STOCK: {
    label: 'Estoque baixo',
    description: 'Um produto chegou ao limite de estoque baixo, ou esgotou.',
    group: 'stock',
    defaultOn: true,
  },
  SHIPPING_DISCONNECTED: {
    label: 'Frete desconectado',
    description: 'A conta do Melhor Envio caiu: a loja não calcula frete até reconectar.',
    group: 'system',
    defaultOn: true,
  },
  SITE_DOWN: {
    label: 'Loja fora do ar',
    description: 'A loja, o painel ou a API pararam de responder — e quando voltam.',
    group: 'system',
    defaultOn: true,
  },
}

export const DEFAULT_ALERT_EVENTS: readonly AlertEventType[] = ALERT_EVENT_TYPES.filter(
  (type) => ALERT_EVENT_CATALOG[type].defaultOn,
)

export const ALERT_CHANNEL_LABEL: Record<AlertChannel, string> = {
  EMAIL: 'E-mail',
  TELEGRAM: 'Telegram',
  WHATSAPP: 'WhatsApp',
}
