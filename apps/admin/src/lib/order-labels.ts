import type { OrderSituation, OrderAddress } from '@ecommerce/shared/contracts'
import type { PaymentStatus, FulfillmentStatus, PaymentMethod } from '@ecommerce/shared/constants'

/**
 * Rótulos e cores da tela de pedidos. Puro, sem hook — importável de página, de
 * componente e da folha de impressão.
 *
 * As classes usam token semântico (bg-success/15), nunca hex: é o que faz a cor
 * do chip "Entregue" acompanhar o tema em vez de virar um verde solto.
 */

export const SITUATION_LABEL: Record<OrderSituation, string> = {
  AWAITING_PAYMENT: 'Aguardando Pagamento',
  PAYMENT_FAILED: 'Pagamento Recusado',
  PAID: 'Pago',
  PICKING: 'Em Separação',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  RETURNED: 'Devolvido',
  CANCELED: 'Cancelado',
  REFUNDED: 'Reembolsado',
}

export const SITUATION_CLASS: Record<OrderSituation, string> = {
  AWAITING_PAYMENT: 'bg-warning/15 text-warning-foreground border-warning/30',
  PAYMENT_FAILED: 'bg-destructive/10 text-destructive border-destructive/30',
  PAID: 'bg-success/15 text-success border-success/30',
  PICKING: 'bg-primary/10 text-primary border-primary/30',
  SHIPPED: 'bg-primary/15 text-primary border-primary/40',
  DELIVERED: 'bg-success/20 text-success border-success/40',
  RETURNED: 'bg-muted text-muted-foreground border-border',
  CANCELED: 'bg-muted text-muted-foreground border-border',
  REFUNDED: 'bg-destructive/10 text-destructive border-destructive/30',
}

/** Ordem do filtro = fluxo operacional, não alfabética. */
export const SITUATION_ORDER: OrderSituation[] = [
  'AWAITING_PAYMENT',
  'PAID',
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

export const SORT_OPTIONS = [
  { value: '-createdAt', label: 'Mais recentes' },
  { value: 'createdAt', label: 'Mais antigos' },
  { value: '-number', label: 'Número (maior)' },
  { value: 'number', label: 'Número (menor)' },
  { value: '-total', label: 'Maior valor' },
  { value: 'total', label: 'Menor valor' },
] as const

export const formatZip = (zip: string): string =>
  zip.length === 8 ? `${zip.slice(0, 5)}-${zip.slice(5)}` : zip

export const formatPhone = (value: string | null): string => {
  if (!value) return '—'
  const d = value.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return value
}

/**
 * Endereço em múltiplas linhas — o formato que o operador cola na etiqueta.
 * Uma linha só forçaria o conferente a decompor de novo na hora de escrever.
 */
export const formatAddress = (a: OrderAddress): string =>
  [
    a.recipient,
    `${a.street}, ${a.number}${a.complement ? ` - ${a.complement}` : ''}`,
    a.district,
    `${a.city} - ${a.state}`,
    `CEP ${formatZip(a.zipCode)}`,
  ].join('\n')
