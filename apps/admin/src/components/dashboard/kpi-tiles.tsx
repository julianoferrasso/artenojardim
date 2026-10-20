'use client'

import type { DashboardOverview } from '@ecommerce/shared/contracts'
import { cn } from '@/lib/utils'
import { Delta, Sparkline } from './parts'
import { formatDay, METRIC_ORDER, METRICS, percentChange, type MetricKey } from './format'

/**
 * Os cinco números do topo, que também são as abas do gráfico abaixo (como no
 * Stripe e no Plausible): clicar em "Visitas" desenha visitas. Um tile por
 * métrica, sem ícone decorativo — o número é o protagonista.
 */
export function KpiTiles({
  overview,
  selected,
  versus,
  onSelect,
}: {
  overview: DashboardOverview
  selected: MetricKey
  /** "ao período anterior", "ao ano anterior" — para o leitor de tela. */
  versus: string
  onSelect: (metric: MetricKey) => void
}) {
  const { current, previous } = overview.summary

  return (
    <div
      role="tablist"
      aria-label="Métricas do período"
      className="grid grid-cols-2 gap-px bg-border lg:grid-cols-5"
    >
      {METRIC_ORDER.map((key) => {
        const value = current[key]
        const isSelected = key === selected
        const spec = METRICS[key]
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(key)}
            className={cn(
              // O 5º tile ocupa a linha inteira em 2 colunas: sem isso sobra uma célula cinza vazia.
              'relative flex min-w-0 flex-col gap-1 bg-card px-5 pt-4 pb-3 text-left transition-colors last:col-span-2 hover:bg-muted/50 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none lg:last:col-span-1',
              isSelected && 'bg-muted/40',
            )}
          >
            {isSelected && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-chart-1" />}
            <span className={cn('text-sm', isSelected ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              {spec.label}
            </span>
            <span className="truncate text-2xl font-semibold tracking-tight">
              {value === null ? '—' : spec.format(value)}
            </span>
            {value === null ? (
              <span className="text-xs text-muted-foreground">
                {overview.trafficSince ? `contando desde ${formatDay(overview.trafficSince)}` : 'começa a contar agora'}
              </span>
            ) : overview.comparison ? (
              <Delta value={percentChange(value, previous ? previous[key] : null)} versus={versus} />
            ) : null}
            <div className="mt-1">
              <Sparkline values={overview.series.map((p) => (p.current ? p.current[key] : null))} />
            </div>
          </button>
        )
      })}
    </div>
  )
}
