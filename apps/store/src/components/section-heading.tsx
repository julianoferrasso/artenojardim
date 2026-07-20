import { cn } from '@/lib/utils'

/**
 * Título de seção padronizado: serif da marca + traço decorativo. Usado na home
 * e nas páginas de listagem para manter a mesma hierarquia visual em toda a loja.
 */
export const SectionHeading = ({
  title,
  subtitle,
  align = 'center',
  className,
}: {
  title: string
  subtitle?: string
  align?: 'center' | 'left'
  className?: string
}) => (
  <div className={cn('mb-6', align === 'center' ? 'text-center' : 'text-left', className)}>
    <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
    <span
      aria-hidden
      className={cn('mt-3 block h-0.5 w-12 rounded-full bg-primary/60', align === 'center' && 'mx-auto')}
    />
    {subtitle && (
      <p className={cn('mt-3 text-muted-foreground', align === 'center' && 'mx-auto max-w-xl')}>
        {subtitle}
      </p>
    )}
  </div>
)
