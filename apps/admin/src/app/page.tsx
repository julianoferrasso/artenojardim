'use client'

import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { DashboardRange, SalesPoint, TopProduct, TopViewed } from '@ecommerce/shared/contracts'
import { useDashboard } from '@/lib/dashboard'
import { formatBRL } from '@/lib/utils'

const RANGES: Array<{ value: DashboardRange; label: string }> = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
]

/**
 * Cores do gráfico lidas dos tokens semânticos em runtime (getComputedStyle
 * devolve o valor concreto do oklch). Assim o Recharts, que precisa de string de
 * cor de verdade, respeita o tema sem hex cravado no código.
 */
function useChartColors() {
  const [c, setC] = useState({
    primary: 'oklch(0.48 0.13 255)',
    border: 'oklch(0.922 0 0)',
    muted: 'oklch(0.556 0 0)',
  })
  useEffect(() => {
    const s = getComputedStyle(document.documentElement)
    const read = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
    setC({
      primary: read('--primary', 'oklch(0.48 0.13 255)'),
      border: read('--border', 'oklch(0.922 0 0)'),
      muted: read('--muted-foreground', 'oklch(0.556 0 0)'),
    })
  }, [])
  return c
}

const shortDay = (iso: string): string => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export default function DashboardPage() {
  const [range, setRange] = useState<DashboardRange>('30d')
  const { data, isLoading, error } = useDashboard(range)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={
                'rounded px-3 py-1 text-sm ' +
                (range === r.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent')
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">Falha ao carregar as métricas.</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {data && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <Kpi label="Receita" value={formatBRL(data.summary.revenue)} />
            <Kpi label="Pedidos pagos" value={String(data.summary.orders)} />
            <Kpi label="Ticket médio" value={formatBRL(data.summary.averageTicket)} />
            <Kpi label="Itens vendidos" value={String(data.summary.itemsSold)} />
            <Kpi label="Pedidos pendentes" value={String(data.summary.pendingOrders)} />
          </section>

          <SalesChart series={data.salesSeries} />

          <div className="grid gap-6 lg:grid-cols-2">
            <TopProducts items={data.topProducts} />
            <TopViewedList items={data.topViewed} />
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function SalesChart({ series }: { series: SalesPoint[] }) {
  const colors = useChartColors()

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">Receita por dia</h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.primary} stopOpacity={0.25} />
                <stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={colors.border} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDay}
              tick={{ fill: colors.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: colors.border }}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v: number) => formatBRL(v).replace(/\s/g, '')}
              tick={{ fill: colors.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={72}
            />
            <Tooltip
              cursor={{ stroke: colors.border }}
              content={({ active, payload, label }) =>
                active && payload && payload.length ? (
                  <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
                    <p className="font-medium">{shortDay(String(label))}</p>
                    <p className="text-muted-foreground">
                      {formatBRL(Number(payload[0]!.value))} · {payload[0]!.payload.orders} pedido(s)
                    </p>
                  </div>
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={colors.primary}
              strokeWidth={2}
              fill="url(#rev)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

/** Medidor horizontal: barra proporcional ao maior valor da lista. */
function Meter({ ratio }: { ratio: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, ratio * 100)}%` }} />
    </div>
  )
}

function TopProducts({ items }: { items: TopProduct[] }) {
  const max = Math.max(1, ...items.map((i) => i.revenue))
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">Mais vendidos (receita)</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem vendas no período.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((it) => (
            <li key={it.productName} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{it.productName}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatBRL(it.revenue)} · {it.unitsSold} un
                </span>
              </div>
              <Meter ratio={it.revenue / max} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TopViewedList({ items }: { items: TopViewed[] }) {
  const max = Math.max(1, ...items.map((i) => i.views))
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">Mais visitados</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem visitas registradas no período.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((it) => (
            <li key={it.productId} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <a href={`/produtos/${it.productId}`} className="truncate hover:text-primary">
                  {it.name}
                </a>
                <span className="shrink-0 tabular-nums text-muted-foreground">{it.views} visitas</span>
              </div>
              <Meter ratio={it.views / max} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
