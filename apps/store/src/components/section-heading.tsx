import { cn } from '@/lib/utils'

/**
 * Título de seção padronizado: serif da marca + flourish decorativo (o ramo com
 * folha do layout). Usado na home e nas páginas de listagem para manter a mesma
 * hierarquia visual em toda a loja.
 */

/** O ramo decorativo sob os títulos. `currentColor` — a cor vem de quem usa. */
const Flourish = ({ className }: { className?: string }) => (
  <svg
    aria-hidden
    viewBox="0 0 80 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
    className={cn('h-3 w-20', className)}
  >
    <path d="M4 6h26" />
    <path d="M50 6h26" />
    {/* A folha central. */}
    <path d="M40 2c3 1.2 4.5 2.6 4.5 4S43 9 40 10c-3-1.2-4.5-2.6-4.5-4S37 3.2 40 2z" />
    <path d="M40 3.5V9" strokeWidth="0.9" />
  </svg>
)

export const SectionHeading = ({
  title,
  subtitle,
  eyebrow,
  align = 'center',
  className,
}: {
  title: string
  subtitle?: string
  /** Linha pequena em CAPS acima do título ("FEITO À MÃO + COM CARINHO"). */
  eyebrow?: string
  align?: 'center' | 'left'
  className?: string
}) => (
  <div className={cn('mb-6', align === 'center' ? 'text-center' : 'text-left', className)}>
    {eyebrow && (
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-primary-ink">
        {eyebrow}
      </p>
    )}
    <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
    <Flourish className={cn('mt-2 text-primary-ink/70', align === 'center' && 'mx-auto')} />
    {subtitle && (
      <p className={cn('mt-3 text-muted-foreground', align === 'center' && 'mx-auto max-w-xl')}>
        {subtitle}
      </p>
    )}
  </div>
)
