'use client'

import { useState, useSyncExternalStore } from 'react'
import { CalendarDays, Check, ChevronDown } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import {
  MAX_RANGE_DAYS,
  spanDays,
  type DashboardPreset,
  type DayKey,
  type DayRange,
} from '@ecommerce/shared/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatCount, formatDayNumeric, formatRange } from './format'

export const PRESET_LABEL: Record<DashboardPreset, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  last7: 'Últimos 7 dias',
  last30: 'Últimos 30 dias',
  last90: 'Últimos 90 dias',
  last365: 'Últimos 12 meses',
  thisWeek: 'Esta semana',
  thisMonth: 'Este mês',
  lastMonth: 'Mês passado',
  thisYear: 'Este ano',
  lastYear: 'Ano passado',
}

/** Os móveis ("últimos N dias") e os de calendário ("este mês") em blocos separados. */
const PRESET_GROUPS: DashboardPreset[][] = [
  ['today', 'yesterday', 'last7', 'last30', 'last90', 'last365'],
  ['thisWeek', 'thisMonth', 'lastMonth', 'thisYear', 'lastYear'],
]

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * Chave ↔ Date LOCAL. O calendário desenha pelo dia local do navegador; um
 * `toISOString` aqui mostraria o dia anterior a quem estiver a oeste de Greenwich.
 */
const toDate = (key: DayKey): Date => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}
const toKey = (date: Date): DayKey => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

const WIDE_QUERY = '(min-width: 640px)'
const subscribeWide = (onChange: () => void) => {
  const query = window.matchMedia(WIDE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
/** Dois meses lado a lado só onde cabem; no celular, um. */
const useIsWide = (): boolean =>
  useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => true)

export function DateRangePicker({
  preset,
  range,
  today,
  onPreset,
  onRange,
}: {
  preset: DashboardPreset | null
  range: DayRange
  today: DayKey
  onPreset: (preset: DashboardPreset) => void
  onRange: (range: DayRange) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>()
  const isWide = useIsWide()

  const handleOpenChange = (next: boolean) => {
    if (next) setDraft({ from: toDate(range.from), to: toDate(range.to) })
    setOpen(next)
  }

  const choosePreset = (next: DashboardPreset) => {
    onPreset(next)
    setOpen(false)
  }

  const draftRange = draft?.from && draft.to ? { from: toKey(draft.from), to: toKey(draft.to) } : null
  const tooLong = draftRange !== null && spanDays(draftRange) > MAX_RANGE_DAYS

  const apply = () => {
    if (!draftRange || tooLong) return
    onRange(draftRange)
    setOpen(false)
  }

  // Abre mostrando o fim do período no último mês visível.
  const end = toDate(range.to)
  const defaultMonth = new Date(end.getFullYear(), end.getMonth() - (isWide ? 1 : 0), 1)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="bg-card">
          <CalendarDays className="text-muted-foreground" />
          <span>{preset ? PRESET_LABEL[preset] : formatRange(range)}</span>
          <ChevronDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <div
            role="listbox"
            aria-label="Períodos prontos"
            className="flex flex-wrap gap-1 border-b border-border p-2 sm:w-44 sm:flex-col sm:flex-nowrap sm:border-r sm:border-b-0"
          >
            {PRESET_GROUPS.map((group, g) => (
              <div key={g} className={cn('contents sm:flex sm:flex-col', g > 0 && 'sm:mt-1 sm:border-t sm:border-border sm:pt-1')}>
                {group.map((p) => {
                  const selected = p === preset
                  return (
                    <button
                      key={p}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => choosePreset(p)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                        selected && 'font-semibold',
                      )}
                    >
                      {PRESET_LABEL[p]}
                      {selected && <Check className="size-4 text-primary" strokeWidth={3} aria-hidden />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="flex flex-col">
            <Calendar
              mode="range"
              numberOfMonths={isWide ? 2 : 1}
              selected={draft}
              // Com um período já completo, o próximo clique começa outro — é o que
              // se espera de um seletor de relatório, não "estender" o atual.
              onSelect={(next, clicked) => setDraft(draft?.from && draft.to ? { from: clicked, to: undefined } : next)}
              defaultMonth={defaultMonth}
              endMonth={toDate(today)}
              disabled={{ after: toDate(today) }}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {draftRange ? (
                  <>
                    {formatDayNumeric(draftRange.from)} até {formatDayNumeric(draftRange.to)}
                    <span className={cn(tooLong && 'text-destructive')}>
                      {' '}
                      · {tooLong ? `máximo de ${formatCount(MAX_RANGE_DAYS)} dias` : `${formatCount(spanDays(draftRange))} dias`}
                    </span>
                  </>
                ) : (
                  'Escolha o último dia'
                )}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={apply} disabled={!draftRange || tooLong}>
                  Aplicar
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
