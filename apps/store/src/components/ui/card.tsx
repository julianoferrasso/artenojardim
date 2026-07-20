import { cn } from '@/lib/utils'

export const Card = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div
    className={cn('rounded-xl border border-border bg-card text-card-foreground shadow-soft', className)}
    {...props}
  />
)
