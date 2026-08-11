import { BADGE_STYLE_CLASSES, type ThemeBadgeStyle } from '@ecommerce/shared/contracts'
import { cn } from '@/lib/utils'

/**
 * A bolinha que envolve um ícone — selos da home e redes sociais do rodapé.
 *
 * Existe para que o contraste seja resolvido em UM lugar. Antes cada bolinha
 * escrevia `bg-card` + `text-primary` na mão, e com uma marca clara o ícone
 * ficava em 1.07:1 contra o próprio fundo: invisível.
 *
 * Os dois estilos são seguros por construção — `filled` usa o par
 * primary/primary-foreground, `outlined` usa a tinta derivada por contraste.
 * O lojista escolhe aparência; legibilidade não é opção.
 */

type Props = {
  style: ThemeBadgeStyle
  /** `true` acrescenta o realce de hover — só para bolinha clicável. */
  interactive?: boolean
  className?: string
  children: React.ReactNode
}

export const IconBadge = ({ style, interactive, className, children }: Props) => (
  <span
    className={cn(
      'flex items-center justify-center rounded-full transition-colors',
      BADGE_STYLE_CLASSES[style],
      // O hover INVERTE a bolinha inteira em vez de recolorir só o ícone:
      // trocar a tinta depende do contraste tinta↔fundo, e foi isso que sumiu.
      interactive && style === 'outlined' && 'hover:bg-primary hover:text-primary-foreground',
      interactive && style === 'filled' && 'hover:opacity-85',
      className,
    )}
  >
    {children}
  </span>
)
