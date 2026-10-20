'use client'

import { RefreshCw } from 'lucide-react'
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from '@ecommerce/shared/constants'
import { COMPARISON_MODES, resolveComparison, type ComparisonMode } from '@ecommerce/shared/utils'
import type { DashboardOverview } from '@ecommerce/shared/contracts'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import type { DashboardView, DashboardViewChange } from '@/lib/dashboard-params'
import { cn } from '@/lib/utils'
import { DateRangePicker } from './date-range-picker'
import { formatRange } from './format'

const COMPARE_LABEL: Record<ComparisonMode, string> = {
  previous_period: 'Período anterior',
  previous_year: 'Ano anterior',
  none: 'Sem comparação',
}

/** Hora da parede de Brasília, como tudo no painel. */
const TIME = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  timeZone: DEFAULT_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * A barra que escopa a página: período primeiro (é o filtro que todo mundo
 * procura), depois a comparação. Fixa no topo ao rolar — quem está lendo o card
 * de estados precisa saber de que período ele fala sem voltar lá em cima.
 */
export function Toolbar({
  view,
  overview,
  isFetching,
  updatedAt,
  onChange,
  onRefresh,
}: {
  view: DashboardView
  overview: DashboardOverview | undefined
  isFetching: boolean
  updatedAt: number
  onChange: (change: DashboardViewChange) => void
  onRefresh: () => void
}) {
  const cutoffAt = overview?.comparison?.cutoffAt
  const comparisonText = view.comparison
    ? `comparado com ${formatRange(view.comparison)}${cutoffAt ? ` até ${TIME.format(new Date(cutoffAt))}` : ''}`
    : 'sem comparação'

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-muted/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Visão geral</h1>
          <p className="text-sm text-muted-foreground">
            {formatRange(view.range)} · {comparisonText}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker
            preset={view.preset}
            range={view.range}
            today={view.today}
            onPreset={(preset) => onChange({ preset })}
            onRange={(range) => onChange({ preset: null, range })}
          />

          <Select value={view.compare} onValueChange={(value: string) => onChange({ compare: value as ComparisonMode })}>
            <SelectTrigger className="bg-card" aria-label="Comparar com">
              <span className="text-muted-foreground">Comparar:</span>
              {COMPARE_LABEL[view.compare]}
            </SelectTrigger>
            {/* `popper`: o padrão "item-aligned" ancora no <SelectValue>, que este
                gatilho não usa (mostra "Comparar:" + rótulo) — e abria fora da tela. */}
            <SelectContent position="popper" align="end">
              {COMPARISON_MODES.map((mode) => {
                const range = resolveComparison({ preset: view.preset, range: view.range }, mode)
                return (
                  <SelectItem key={mode} value={mode}>
                    <span className="flex flex-col items-start">
                      <span>{COMPARE_LABEL[mode]}</span>
                      {range && <span className="text-xs text-muted-foreground">{formatRange(range)}</span>}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isFetching} aria-label="Atualizar agora">
            <RefreshCw className={cn(isFetching && 'animate-spin')} />
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {updatedAt > 0 ? `Atualizado às ${TIME.format(new Date(updatedAt))}` : 'Atualizar'}
            </span>
          </Button>
        </div>
      </div>
    </div>
  )
}
