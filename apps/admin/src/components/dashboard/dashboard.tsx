'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardOverview } from '@/lib/dashboard'
import { useDashboardView } from '@/lib/dashboard-params'
import { cn } from '@/lib/utils'
import { AttentionStrip } from './attention-strip'
import { CustomersCard, StatesCard, TrafficCard } from './audience-cards'
import type { MetricKey } from './format'
import { KpiTiles } from './kpi-tiles'
import { ProductsCard } from './products-card'
import { RecentOrdersCard } from './recent-orders-card'
import { CouponsCard, FunnelCard, PaymentMethodsCard, RevenueBreakdownCard } from './sales-cards'
import { Toolbar } from './toolbar'
import { TrendChart } from './trend-chart'

/** Para o leitor de tela: "12% de aumento em relação ao período anterior". */
const VERSUS = {
  previous_period: 'ao período anterior',
  previous_year: 'ao ano anterior',
  none: '',
} as const

/**
 * Visão geral da loja. Página única, do mais urgente ao detalhe: a fila de
 * trabalho, os números do período, o gráfico e as quebras. Tudo abaixo da barra
 * de filtros responde ao mesmo recorte — os números sempre batem entre si.
 */
export function Dashboard() {
  const { view, update } = useDashboardView()
  const overview = useDashboardOverview(view)
  const [metric, setMetric] = useState<MetricKey>('revenue')
  const data = overview.data
  const versus = VERSUS[view.compare]

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <AttentionStrip />

      <Toolbar
        view={view}
        overview={data}
        isFetching={overview.isFetching}
        updatedAt={overview.dataUpdatedAt}
        onChange={update}
        onRefresh={() => void overview.refetch()}
      />

      {overview.isError && data && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" aria-hidden />
            Não foi possível atualizar. Os números abaixo são da última leitura.
          </span>
          <Button variant="ghost" size="sm" onClick={() => void overview.refetch()}>
            Tentar de novo
          </Button>
        </div>
      )}

      {!data ? (
        overview.isError ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <AlertTriangle className="size-6 text-destructive" aria-hidden />
            <p className="text-sm text-muted-foreground">Não foi possível carregar o painel.</p>
            <Button variant="outline" size="sm" onClick={() => void overview.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <DashboardSkeleton />
        )
      ) : (
        // Trocar de período mantém o quadro anterior, esmaecido, até o novo chegar:
        // nada de esqueleto piscando nem layout pulando a cada clique.
        <div
          aria-busy={overview.isPlaceholderData}
          className={cn('flex flex-col gap-6 transition-opacity', overview.isPlaceholderData && 'opacity-60')}
        >
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            <KpiTiles overview={data} selected={metric} versus={versus} onSelect={setMetric} />
            <TrendChart
              overview={data}
              metric={metric}
              versus={versus}
              onGranularity={(granularity) => update({ granularityChoice: granularity })}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <RevenueBreakdownCard breakdown={data.revenueBreakdown} />
            <FunnelCard funnel={data.funnel} trafficSince={data.trafficSince} />
            <PaymentMethodsCard methods={data.paymentMethods} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <ProductsCard products={data.products} categories={data.categories} className="lg:col-span-2" />
            <TrafficCard traffic={data.traffic} trafficSince={data.trafficSince} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <CustomersCard customers={data.customers} />
            <StatesCard states={data.states} />
            <CouponsCard coupons={data.coupons} />
          </div>

          <RecentOrdersCard range={view.range} />
        </div>
      )}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <Skeleton className="h-96 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
