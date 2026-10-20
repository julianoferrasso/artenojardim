'use client'

import type { ReactNode } from 'react'
import { Info, Inbox, Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatChange, formatPercent } from './format'

/**
 * As peças visuais repetidas do painel. Uma régua só para card, número e barra
 * é o que faz quinze blocos parecerem um painel, e não quinze telas coladas.
 */

/** "Como calculamos": botão de verdade (foco por teclado), não ícone com title. */
export function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Como calculamos: ${label}`}
          className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left">{text}</TooltipContent>
    </Tooltip>
  )
}

export function DashboardCard({
  title,
  info,
  action,
  children,
  className,
}: {
  title: string
  info?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs', className)}>
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {info && <InfoTip label={title} text={info} />}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export function EmptyState({ icon: Icon = Inbox, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      <Icon className="size-5" aria-hidden />
      {children}
    </div>
  )
}

/**
 * Variação contra o comparado. A cor vai no ÍCONE, o número fica na cor do texto:
 * verde e vermelho em letra pequena não passam no contraste, e o ícone (seta)
 * carrega o sentido para quem não distingue as cores.
 */
export function Delta({ value, versus }: { value: number | null; versus: string }) {
  if (value === null) {
    return (
      <span className="text-xs text-muted-foreground">
        —<span className="sr-only"> sem base de comparação</span>
      </span>
    )
  }
  const flat = Math.abs(value) < 0.0005
  const Icon = flat ? Minus : value > 0 ? TrendingUp : TrendingDown
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <Icon
        aria-hidden
        className={cn('size-3.5', flat ? 'text-muted-foreground' : value > 0 ? 'text-success' : 'text-destructive')}
      />
      <span className="text-foreground tabular-nums">{flat ? '0%' : formatChange(value)}</span>
      <span className="sr-only">
        {flat ? 'estável' : value > 0 ? 'de aumento' : 'de queda'} em relação {versus}
      </span>
    </span>
  )
}

/** Tendência do período no tile: só a forma, sem eixo — o número grande é o tile. */
export function Sparkline({ values }: { values: Array<number | null> }) {
  const points = values
    .map((value, index) => ({ index, value }))
    .filter((p): p is { index: number; value: number } => p.value !== null)
  if (points.length < 2) return <div className="h-8" aria-hidden />

  const width = 100
  const height = 32
  const pad = 2
  const max = Math.max(...points.map((p) => p.value))
  const x = (index: number) => (index / Math.max(1, values.length - 1)) * width
  const y = (value: number) => (max === 0 ? height - pad : height - pad - (value / max) * (height - pad * 2))

  const line = points.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.index).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')
  const first = points[0]!
  const last = points[points.length - 1]!
  const area = `${line} L${x(last.index).toFixed(2)},${height} L${x(first.index).toFixed(2)},${height} Z`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <path d={area} className="fill-chart-1/10" />
      <path
        d={line}
        className="fill-none stroke-chart-1"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export type BarListItem = {
  key: string
  label: ReactNode
  value: number
  valueLabel: string
  detail?: string
}

/**
 * Ranking com medidor. Uma cor só (é UMA série): pintar cada barra de um tom
 * repetiria em cor o que o comprimento já diz. O trilho é o mesmo azul, claro.
 */
export function BarList({ items }: { items: BarListItem[] }) {
  const top = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0 tabular-nums">
              {item.valueLabel}
              {item.detail && <span className="text-muted-foreground"> · {item.detail}</span>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-chart-1/15">
            <div
              className="h-full rounded-full bg-chart-1"
              style={{ width: `${Math.max(1.5, (item.value / top) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Classes de cor por slot — literais, para o Tailwind enxergar. A cor segue a
 * ENTIDADE (Pix é sempre o slot 1), nunca a posição no ranking: um filtro que
 * some com uma linha não pode repintar as outras.
 */
export const SLOT_BG = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  neutral: 'bg-chart-comparison',
} as const

export type ShareSegment = {
  key: string
  label: string
  value: number
  valueLabel: string
  color: keyof typeof SLOT_BG
  detail?: string
}

/** Parte do todo: barra empilhada de 100% + legenda com valor e fatia (nada de pizza). */
export function ShareBar({ segments }: { segments: ShareSegment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const share = (value: number) => (total > 0 ? value / total : 0)
  const visible = segments.filter((s) => s.value > 0)

  return (
    <div className="flex flex-col gap-3">
      <div
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${formatPercent(share(s.value))}`).join(', ')}
        className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
      >
        {visible.map((s) => (
          <div
            key={s.key}
            className={cn('h-full first:rounded-l-full last:rounded-r-full', SLOT_BG[s.color])}
            style={{ width: `${share(s.value) * 100}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden className={cn('size-2.5 shrink-0 rounded-sm', SLOT_BG[s.color])} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {s.valueLabel}
              <span className="text-muted-foreground">
                {' '}
                · {formatPercent(share(s.value))}
                {s.detail && ` · ${s.detail}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
