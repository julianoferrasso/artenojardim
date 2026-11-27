'use client'

import type { ReactNode } from 'react'
import { Check, Circle, Star } from 'lucide-react'
import type { ProductStatus } from '@ecommerce/shared/constants'
import { Switch } from '@/components/ui/switch'
import { PRODUCT_STATUS_LABEL } from '@/lib/products'
import type { ChecklistItem } from '@/lib/product-draft'
import { cn } from '@/lib/utils'

const STATUS_CLASS: Record<ProductStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ACTIVE: 'bg-success/15 text-success',
  ARCHIVED: 'bg-muted text-muted-foreground line-through',
}

const STATUS_HINT: Record<ProductStatus, string> = {
  DRAFT: 'Não aparece na loja até ser publicado.',
  ACTIVE: 'À venda na loja.',
  ARCHIVED: 'Fora da loja. Continua aqui e pode ser restaurado.',
}

type Props = {
  /** null = produto novo, ainda não salvo. */
  status: ProductStatus | null
  checklist: ChecklistItem[]
  isFeatured: boolean
  onFeaturedChange: (on: boolean) => void
  children?: ReactNode
}

/**
 * "Este produto aparece onde?" num lugar só: status, destaque e o que falta
 * para publicar — a mesma régua da API (publishBlockers), então "pronto" aqui
 * é pronto lá.
 */
export function PublishCard({ status, checklist, isFeatured, onFeaturedChange, children }: Props) {
  const ready = checklist.every((c) => c.ok)
  const showChecklist = status !== 'ACTIVE' || !ready

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Publicação</h2>
        <span className={cn('rounded px-2 py-0.5 text-xs font-medium', status ? STATUS_CLASS[status] : 'bg-muted text-muted-foreground')}>
          {status ? PRODUCT_STATUS_LABEL[status] : 'Novo'}
        </span>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{status ? STATUS_HINT[status] : 'Salve como rascunho ou publique direto.'}</p>

      {showChecklist && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {ready ? 'Pronto para publicar' : status === 'ACTIVE' ? 'Pendências na loja' : 'Para publicar falta'}
          </p>
          <ul className="flex flex-col gap-1">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-sm">
                {item.ok ? (
                  <Check className="size-4 shrink-0 text-success" aria-label="ok" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground" aria-label="pendente" />
                )}
                <span className={cn(item.ok && 'text-muted-foreground')}>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border p-3">
        <span className="flex items-center gap-2 text-sm">
          <Star className={cn('size-4', isFeatured && 'fill-warning text-warning')} />
          <span>
            Em destaque
            <span className="block text-xs text-muted-foreground">Aparece na seção Destaques da home.</span>
          </span>
        </span>
        <Switch checked={isFeatured} onCheckedChange={onFeaturedChange} />
      </label>

      {children}
    </section>
  )
}
