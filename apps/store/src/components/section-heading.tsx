import { cn } from '@/lib/utils'

/**
 * Título de seção padronizado: serif da marca + flourish decorativo (o ramo com
 * folha do layout). Usado na home e nas páginas de listagem para manter a mesma
 * hierarquia visual em toda a loja.
 */

/** O ramo decorativo sob os títulos. `currentColor` — a cor vem de quem usa. */
export const Flourish = ({ className }: { className?: string }) => (
  <svg
    aria-hidden
    viewBox="0 0 256 46"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={cn('h-9 w-50', className)}
  >
    <path d="M1 21.75H84M172 21.75H255" strokeWidth="0.94" opacity="0.45" />
    {/* Raminho de três folhas, decalcado do desenho de referência da cliente. */}
    <g strokeWidth="1.17">
      <path d="M125.8 22.2C123.3 16.9 119.2 13.2 113 14C108 14.5 102.4 18.2 101.9 21.1C101.4 23.9 108.5 28.3 114 28.4C119.1 28.3 123 25.6 125.8 22.2Z" />
      <path d="M131.8 1.4C129 0.9 128.2 7.6 129.8 11.8C131.5 17 134.8 19.1 139.6 20.5C141.2 13.8 140.7 10 139.1 7.1C137.7 4.6 134.6 1.6 131.8 1.4Z" />
      <path d="M144.9 26.3C139.7 26 134.1 27.4 130.9 30.8C127.1 34.7 125.4 39.2 125.9 41.9C126.6 44.8 131.1 44.1 134.2 43.2C139.3 42.1 142.7 38.3 143.9 34.5C145 31.3 144.9 27.5 144.9 26.3Z" />
      <path d="M125.8 22.2C130.5 23.6 138.7 24.4 144.3 23.9C147.5 23.7 151 23.4 154.2 22" />
      <path d="M139.6 20.5C141.5 21.6 142.4 23.2 146.3 23.6" />
      <path d="M144.9 26.3C146.8 24.8 148.6 24 150.1 23.2" />
    </g>
    {/* A ponta do galho engrossa, como pincelada. */}
    <path d="M148.8 23.5C150.6 23.2 152.5 22.8 154.2 22" strokeWidth="1.34" />
    <path d="M151.8 22.9C152.6 22.6 153.4 22.3 154.2 22" strokeWidth="1.53" />
    {/* Nervuras tracejadas. */}
    <g strokeWidth="0.51">
      <path d="M105.5 20.8L110.5 20" />
      <path d="M113.1 19.9C118.1 19.9 121.4 20.5 125.8 22.2" />
      <path d="M131.6 4.9C131.8 6.5 131.9 6.5 132.4 8.3" />
      <path d="M133.2 10.7C134.5 14.4 136.8 17.6 139.6 20.5" />
      <path d="M144.9 26.3C141 28.2 136.2 31.6 133.2 34.9" />
      <path d="M131.4 37C130.1 38.5 129.4 39.5 128.5 40.7" />
    </g>
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
