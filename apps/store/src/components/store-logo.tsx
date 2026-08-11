import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * O logo da loja, com fallback.
 *
 * O arquivo em `public/` não é decoração: `getStore()` no layout tem
 * `.catch(() => null)`, então se a API estiver fora a loja ainda renderiza —
 * e sem este fallback ela renderizaria sem marca nenhuma. Feia-mas-viva é o
 * comportamento certo aqui.
 *
 * `next.config.ts` já autoriza `${NEXT_PUBLIC_API_URL}/uploads/**` em
 * remotePatterns, então a URL vinda do painel é otimizada como qualquer outra.
 */

export const FALLBACK_LOGO = '/logo-bird.png'

type Props = {
  src: string | null
  alt: string
  size: number
  className?: string
  priority?: boolean
}

export const StoreLogo = ({ src, alt, size, className, priority }: Props) => (
  <Image
    src={src ?? FALLBACK_LOGO}
    alt={alt}
    width={size}
    height={size}
    priority={priority}
    // object-contain: o logo do lojista pode não ser quadrado, e esticar a
    // marca de alguém é pior do que sobrar espaço.
    className={cn('object-contain', className)}
  />
)
