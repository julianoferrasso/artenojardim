'use client'

import Link from 'next/link'
import { CheckCircle2, ChevronRight, MessagesSquare, PackageOpen, PackageX, type LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useLowStockCount } from '@/lib/inventory'
import { useOrders } from '@/lib/orders'
import { useSupportSummary } from '@/lib/support'
import { cn } from '@/lib/utils'
import { formatCount } from './format'

/**
 * A fila de trabalho de AGORA — não depende do período, por isso fica acima da
 * barra de filtros. Cada número sai da mesma consulta da tela que ele abre: o
 * "4 a separar" daqui é o total da lista filtrada lá, nunca uma conta paralela.
 */
export function AttentionStrip() {
  const toPick = useOrders({ situation: 'PAID', perPage: 1 })
  const support = useSupportSummary()
  const lowStock = useLowStockCount()

  const cancelRequests = support.data?.cancelRequests ?? 0

  return (
    <section aria-label="Precisa de atenção agora" className="grid gap-3 sm:grid-cols-3">
      <Item
        href="/pedidos?situacao=PAID"
        icon={PackageOpen}
        count={toPick.data?.meta.total}
        one="pedido a separar"
        many="pedidos a separar"
        calm="Nenhum pedido a separar"
      />
      <Item
        href="/atendimento"
        icon={MessagesSquare}
        count={support.data?.needsAction}
        one="atendimento aguardando"
        many="atendimentos aguardando"
        calm="Atendimento em dia"
        hint={cancelRequests > 0 ? `${formatCount(cancelRequests)} pedido(s) de cancelamento` : undefined}
      />
      <Item
        href="/estoque?baixo=1"
        icon={PackageX}
        count={lowStock.data}
        one="variação com estoque baixo"
        many="variações com estoque baixo"
        calm="Estoque em dia"
      />
    </section>
  )
}

function Item({
  href,
  icon: Icon,
  count,
  one,
  many,
  calm,
  hint,
}: {
  href: string
  icon: LucideIcon
  count: number | undefined
  one: string
  many: string
  calm: string
  hint?: string | undefined
}) {
  const pending = count !== undefined && count > 0

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xs transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span
        aria-hidden
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          pending ? 'bg-warning/20 text-warning-foreground' : 'bg-success/15 text-success',
        )}
      >
        {count === undefined || pending ? <Icon className="size-4" /> : <CheckCircle2 className="size-4" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        {count === undefined ? (
          <Skeleton className="h-5 w-32" />
        ) : pending ? (
          <span className="text-sm">
            <span className="font-semibold">{formatCount(count)}</span> {count === 1 ? one : many}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{calm}</span>
        )}
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  )
}
