import { SUPPORT_THREAD_STATUS_LABEL, type SupportThreadStatus } from '@ecommerce/shared/constants'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** O único lugar que pinta status de conversa: lista, detalhe e card do pedido. */
const STATUS_CLASS: Record<SupportThreadStatus, string> = {
  OPEN: 'bg-warning/15 text-warning-foreground border-warning/30',
  ANSWERED: 'bg-success/15 text-success border-success/30',
  CLOSED: 'bg-muted text-muted-foreground border-border',
}

export const SupportStatusBadge = ({
  status,
  className,
}: {
  status: SupportThreadStatus
  className?: string
}) => (
  <Badge variant="outline" className={cn('font-medium', STATUS_CLASS[status], className)}>
    {SUPPORT_THREAD_STATUS_LABEL[status]}
  </Badge>
)

/** Selo do pedido de cancelamento esperando decisão. Mesma cor nas listas de pedidos e de conversas. */
export const CancelRequestedBadge = ({ className }: { className?: string }) => (
  <Badge
    variant="outline"
    className={cn('bg-warning/15 text-warning-foreground border-warning/30 font-medium', className)}
  >
    Cancelamento solicitado
  </Badge>
)
