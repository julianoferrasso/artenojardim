'use client'

import { useState } from 'react'
import { BarChart3, Table2 } from 'lucide-react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { DashboardOverview } from '@ecommerce/shared/contracts'
import { allowedGranularities, spanDays, type Granularity } from '@ecommerce/shared/utils'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { METRIC_DEFINITIONS } from './definitions'
import { formatBucket, formatChange, formatRange, METRICS, percentChange, type MetricKey } from './format'
import { Delta, InfoTip } from './parts'

const GRANULARITY_LABEL: Record<Granularity, string> = {
  hour: 'Hora',
  day: 'Dia',
  week: 'Semana',
  month: 'Mês',
}

type Datum = {
  key: string
  previousKey: string | null
  current: number | null
  previous: number | null
}

/**
 * O gráfico da métrica escolhida nos tiles. O período atual é a única cor (área
 * com véu leve + linha de 2px); o comparado é uma linha cinza — contexto, não
 * protagonista. Um eixo só: comparar duas métricas de escalas diferentes no
 * mesmo gráfico inventa correlação.
 */
export function TrendChart({
  overview,
  metric,
  versus,
  onGranularity,
}: {
  overview: DashboardOverview
  metric: MetricKey
  versus: string
  onGranularity: (granularity: Granularity) => void
}) {
  const [asTable, setAsTable] = useState(false)
  const spec = METRICS[metric]
  const { granularity, comparison } = overview
  const hasComparison = comparison !== null
  const options = allowedGranularities(spanDays(overview.period))

  const data: Datum[] = overview.series.map((p) => ({
    key: p.key,
    previousKey: p.previousKey,
    current: p.current ? p.current[metric] : null,
    previous: p.previous ? p.previous[metric] : null,
  }))

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold">{spec.label}</h2>
            <InfoTip label={spec.label} text={METRIC_DEFINITIONS[metric]} />
          </div>
          {/* Legenda: duas séries pedem legenda sempre; a chave é traço, como a linha. */}
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="h-0.5 w-4 rounded-full bg-chart-1" />
              {formatRange(overview.period)}
            </li>
            {comparison && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-4 rounded-full bg-chart-comparison" />
                {formatRange(comparison)}
              </li>
            )}
          </ul>
        </div>

        <div className="flex items-center gap-2">
          {options.length > 1 && (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={granularity}
              onValueChange={(value: string) => value && onGranularity(value as Granularity)}
              aria-label="Agrupar por"
            >
              {options.map((g) => (
                <ToggleGroupItem key={g} value={g} className="px-2.5 text-xs">
                  {GRANULARITY_LABEL[g]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            aria-label={asTable ? 'Ver como gráfico' : 'Ver como tabela'}
          >
            {asTable ? <BarChart3 /> : <Table2 />}
            <span className="hidden sm:inline">{asTable ? 'Gráfico' : 'Tabela'}</span>
          </Button>
        </div>
      </div>

      {asTable ? (
        <SeriesTable data={data} metric={metric} granularity={granularity} hasComparison={hasComparison} />
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.16} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="key"
                tickFormatter={(key: string) => formatBucket(key, granularity, 'tick')}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                minTickGap={28}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(value: number) => spec.axis(value)}
                tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={72}
                allowDecimals={metric === 'conversionRate'}
                domain={[0, 'auto']}
              />
              <Tooltip
                cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                content={(props: TooltipContentProps) => (
                  <TrendTooltip {...props} metric={metric} granularity={granularity} versus={versus} />
                )}
              />
              {hasComparison && (
                <Line
                  type="monotone"
                  dataKey="previous"
                  stroke="var(--chart-comparison)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
              <Area
                type="monotone"
                dataKey="current"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#trend-fill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)', fill: 'var(--chart-1)' }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function TrendTooltip({
  active,
  payload,
  metric,
  granularity,
  versus,
}: TooltipContentProps & { metric: MetricKey; granularity: Granularity; versus: string }) {
  const datum = payload?.[0]?.payload as Datum | undefined
  if (!active || !datum) return null
  const spec = METRICS[metric]
  const showPrevious = datum.previousKey !== null

  return (
    <div className="flex min-w-52 flex-col gap-1.5 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <Row
        swatch="bg-chart-1"
        label={formatBucket(datum.key, granularity, 'full')}
        value={datum.current === null ? '—' : spec.format(datum.current)}
      />
      {showPrevious && (
        <Row
          swatch="bg-chart-comparison"
          label={formatBucket(datum.previousKey!, granularity, 'full')}
          value={datum.previous === null ? '—' : spec.format(datum.previous)}
        />
      )}
      {showPrevious && (
        <div className="border-t border-border pt-1.5">
          <Delta value={percentChange(datum.current, datum.previous)} versus={versus} />
        </div>
      )}
    </div>
  )
}

/** Valor em destaque, rótulo atrás: no tooltip o leitor já sabe a série e quer o número. */
function Row({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span aria-hidden className={`h-0.5 w-3 rounded-full ${swatch}`} />
        {label}
      </span>
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  )
}

/** A tabela gêmea do gráfico: todo valor também legível sem passar o mouse. */
function SeriesTable({
  data,
  metric,
  granularity,
  hasComparison,
}: {
  data: Datum[]
  metric: MetricKey
  granularity: Granularity
  hasComparison: boolean
}) {
  const spec = METRICS[metric]
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Período</TableHead>
            <TableHead className="text-right">{spec.label}</TableHead>
            {hasComparison && <TableHead className="text-right">Comparado</TableHead>}
            {hasComparison && <TableHead className="text-right">Variação</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((d) => {
            const change = percentChange(d.current, d.previous)
            return (
              <TableRow key={d.key}>
                <TableCell className="whitespace-nowrap">{formatBucket(d.key, granularity, 'full')}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.current === null ? '—' : spec.format(d.current)}
                </TableCell>
                {hasComparison && (
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {d.previous === null ? '—' : spec.format(d.previous)}
                  </TableCell>
                )}
                {hasComparison && (
                  <TableCell className="text-right tabular-nums">
                    {change === null ? '—' : formatChange(change)}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
