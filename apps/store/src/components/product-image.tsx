import Image from 'next/image'
import { ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A ÚNICA forma de renderizar imagem de produto na loja. Antes cada tela montava
 * seu próprio `<Image>` com seu próprio fallback: o card dizia "sem imagem", o
 * carrinho deixava um quadrado cinza vazio e o checkout não mostrava nada. Foi
 * essa divergência que deixou a foto sumida do carrinho passar despercebida.
 *
 * `fit` carrega a regra visual do projeto: `contain` na galeria do produto (foto
 * inteira, nada cortado) e `cover` em card e miniatura (preenche a grade).
 */

type Props = {
  src: string | null | undefined
  alt: string
  fit?: 'contain' | 'cover'
  sizes: string
  priority?: boolean
  className?: string
}

export const ProductImage = ({ src, alt, fit = 'cover', sizes, priority, className }: Props) => {
  if (!src) return <ImagePlaceholder className={className} />

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      // `priority` já implica eager; marcar lazy junto é conflito.
      loading={priority ? undefined : 'lazy'}
      className={cn(fit === 'contain' ? 'object-contain' : 'object-cover', className)}
    />
  )
}

/** "Sem imagem" — idêntico em card, produto, carrinho, minicarrinho e checkout. */
export const ImagePlaceholder = ({
  className,
  showLabel = true,
}: {
  className?: string
  showLabel?: boolean
}) => (
  <div
    className={cn(
      'flex size-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground',
      className,
    )}
  >
    <ImageOff className="size-5" aria-hidden />
    {showLabel && <span className="text-xs">sem imagem</span>}
  </div>
)
