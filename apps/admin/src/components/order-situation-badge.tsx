import type { OrderSituation } from '@ecommerce/shared/contracts'
import { Badge } from '@/components/ui/badge'
import { SITUATION_LABEL, SITUATION_CLASS } from '@/lib/order-labels'
import { cn } from '@/lib/utils'

/**
 * O ÚNICO lugar que pinta situação de pedido. Lista, detalhe e impressão passam
 * por aqui — dois mapas de cor soltos viram, em três meses, um "Enviado" verde
 * numa tela e azul na outra.
 */
export const OrderSituationBadge = ({
  situation,
  className,
}: {
  situation: OrderSituation
  className?: string
}) => (
  <Badge variant="outline" className={cn('font-medium', SITUATION_CLASS[situation], className)}>
    {SITUATION_LABEL[situation]}
  </Badge>
)
