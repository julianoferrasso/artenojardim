import type { OrderSituation } from '@ecommerce/shared/contracts'
import { SITUATION_LABEL } from '@ecommerce/shared/constants'
import { cn } from '@/lib/utils'

/**
 * O ÚNICO lugar que pinta situação de pedido na loja.
 *
 * Os RÓTULOS vêm de @ecommerce/shared/constants, os mesmos que o admin usa —
 * um pedido não pode se chamar "Recusado" no painel e "Pagamento não aprovado"
 * na conta do cliente. As CORES são daqui porque paleta é apresentação: a loja
 * usa tons mais suaves que o painel, onde o operador precisa do alarme.
 *
 * Token semântico sempre (bg-success/15), nunca hex — é o que faz o chip
 * acompanhar o tema em vez de virar um verde solto na Fase 4.
 */
const SITUATION_CLASS: Record<OrderSituation, string> = {
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

export const OrderSituationBadge = ({
  situation,
  className,
}: {
  situation: OrderSituation
  className?: string
}) => (
  <span
    className={cn(
      'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
      SITUATION_CLASS[situation],
      className,
    )}
  >
    {SITUATION_LABEL[situation]}
  </span>
)
