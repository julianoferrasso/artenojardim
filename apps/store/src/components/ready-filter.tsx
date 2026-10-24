import Link from 'next/link'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * "Só pronta entrega": o filtro de quem compra presente com data marcada (o mais
 * usado em loja artesanal — Etsy e Elo7 o põem no topo). É link, não botão: a
 * lista filtrada tem URL própria, e voltar no navegador desfaz o filtro.
 */
export const ReadyFilterChip = ({ active, href }: { active: boolean; href: string }) => (
  <Link
    href={href}
    scroll={false}
    aria-current={active ? 'true' : undefined}
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
      active
        ? 'border-success/40 bg-success/10 font-medium text-foreground'
        : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
    )}
  >
    <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden />
    Pronta entrega
    {active && <X className="size-3.5" aria-label="Remover filtro" />}
  </Link>
)
