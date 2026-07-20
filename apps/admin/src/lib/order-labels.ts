import type { OrderSituation, OrderAddress } from '@ecommerce/shared/contracts'

/**
 * Cores e formatação da tela de pedidos. Puro, sem hook — importável de página,
 * de componente e da folha de impressão.
 *
 * Os RÓTULOS (SITUATION_LABEL, PAYMENT_STATUS_LABEL, …) moram em
 * `@ecommerce/shared/constants` desde que a área do cliente nasceu: o mesmo
 * pedido precisa ter o mesmo nome nas duas telas. Aqui ficam só as classes, que
 * são apresentação e podem divergir entre painel e loja.
 *
 * As classes usam token semântico (bg-success/15), nunca hex: é o que faz a cor
 * do chip "Entregue" acompanhar o tema em vez de virar um verde solto.
 */

export {
  SITUATION_LABEL,
  SITUATION_ORDER,
  PAYMENT_STATUS_LABEL,
  FULFILLMENT_LABEL,
  PAYMENT_METHOD_LABEL,
} from '@ecommerce/shared/constants'

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
