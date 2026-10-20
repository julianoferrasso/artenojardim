'use client'

import Link from 'next/link'
import { ReceiptText } from 'lucide-react'
import type { DayRange } from '@ecommerce/shared/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { OrderSituationBadge } from '@/components/order-situation-badge'
import { useOrders } from '@/lib/orders'
import { formatBRL, formatRelative } from '@/lib/utils'
import { CARD_DEFINITIONS } from './definitions'
import { DashboardCard, EmptyState } from './parts'

/** Últimos pedidos DO PERÍODO: a lista também responde ao filtro de cima. */
export function RecentOrdersCard({ range }: { range: DayRange }) {
  const { data, isLoading } = useOrders({ from: range.from, to: range.to, perPage: 6, sort: '-createdAt' })
  const all = `/pedidos?de=${range.from}&ate=${range.to}`

  return (
    <DashboardCard
      title="Últimos pedidos"
      info={CARD_DEFINITIONS.recentOrders}
      action={
        <Link href={all} className="text-sm text-primary hover:underline">
          Ver todos do período
        </Link>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.data.length === 0 ? (
        <EmptyState icon={ReceiptText}>Nenhum pedido no período.</EmptyState>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {data.data.map((order) => (
            <li key={order.id}>
              <Link
                href={`/pedidos/${order.id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60"
              >
                <span className="w-14 shrink-0 text-sm font-medium tabular-nums">#{order.number}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{order.customerName}</span>
                  <span className="text-xs text-muted-foreground">{formatRelative(order.createdAt)}</span>
                </span>
                <OrderSituationBadge situation={order.situation} className="hidden sm:inline-flex" />
                <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums">
                  {formatBRL(order.total)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  )
}
