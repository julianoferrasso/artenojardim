import { cn } from '@/lib/utils'

export const Input = ({ className, ...props }: React.ComponentProps<'input'>) => (
  <input
    className={cn(
      'h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground transition-colors',
      'placeholder:text-muted-foreground',
      'outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  />
)
