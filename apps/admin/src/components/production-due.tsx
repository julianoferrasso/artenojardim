import { formatSpDeadline, spDayKey } from '@ecommerce/shared/utils'
import { cn } from '@/lib/utils'

/**
 * O prazo de produção de uma encomenda paga: "Produzir até qua., 04/11", ou em
 * vermelho quando o dia já passou — a promessa feita ao cliente no checkout.
 * O dia é o brasileiro (o painel é aberto de qualquer fuso, a loja vive em um).
 */
export const ProductionDue = ({ at, className }: { at: string; className?: string }) => {
  const late = spDayKey(new Date(at)) < spDayKey(new Date())
  return (
    <span className={cn('text-xs', late ? 'font-medium text-destructive' : 'text-muted-foreground', className)}>
      {late ? 'Atrasada — era até ' : 'Produzir até '}
      {formatSpDeadline(at)}
    </span>
  )
}
