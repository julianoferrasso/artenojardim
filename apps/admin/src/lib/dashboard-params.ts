import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  DASHBOARD_PRESETS,
  MAX_RANGE_DAYS,
  allowedGranularities,
  autoGranularity,
  isDayKey,
  resolveComparison,
  resolvePreset,
  spanDays,
  spDayKey,
  type ComparisonMode,
  type DashboardPreset,
  type DayKey,
  type DayRange,
  type Granularity,
} from '@ecommerce/shared/utils'

/**
 * A visão do dashboard mora na URL: F5 mantém o período e o link copiado abre a
 * mesma visão para outra pessoa. As chaves são em português porque é isso que o
 * lojista vê na barra de endereço e compartilha.
 *
 *   /?periodo=thisMonth&comparar=ano&agrupar=semana
 *   /?de=2026-09-01&ate=2026-09-30
 *
 * O padrão (últimos 30 dias, contra o período anterior, agrupamento automático)
 * não aparece na URL: `/` continua sendo o painel de sempre.
 */

export const DEFAULT_PRESET: DashboardPreset = 'last30'

const COMPARE_FROM_PARAM: Record<string, ComparisonMode> = {
  anterior: 'previous_period',
  ano: 'previous_year',
  nenhum: 'none',
}
const COMPARE_TO_PARAM: Record<ComparisonMode, string> = {
  previous_period: 'anterior',
  previous_year: 'ano',
  none: 'nenhum',
}
const GRANULARITY_FROM_PARAM: Record<string, Granularity> = {
  hora: 'hour',
  dia: 'day',
  semana: 'week',
  mes: 'month',
}
const GRANULARITY_TO_PARAM: Record<Granularity, string> = {
  hour: 'hora',
  day: 'dia',
  week: 'semana',
  month: 'mes',
}

export type DashboardView = {
  today: DayKey
  /** null = datas livres escolhidas no calendário. */
  preset: DashboardPreset | null
  range: DayRange
  compare: ComparisonMode
  comparison: DayRange | null
  /** O que o usuário escolheu; null = automático. */
  granularityChoice: Granularity | null
  /** O que vale de fato. */
  granularity: Granularity
}

export type DashboardViewChange = {
  preset?: DashboardPreset | null
  range?: DayRange
  compare?: ComparisonMode
  granularityChoice?: Granularity | null
}

const isPreset = (value: string | null): value is DashboardPreset =>
  value !== null && (DASHBOARD_PRESETS as readonly string[]).includes(value)

/** URL malformada (link velho, edição à mão) cai no padrão em vez de quebrar a tela. */
const parseCustomRange = (params: URLSearchParams, today: DayKey): DayRange | null => {
  const from = params.get('de')
  const to = params.get('ate')
  if (!from || !to || !isDayKey(from) || !isDayKey(to) || from > to || from > today) return null
  const range = { from, to: to > today ? today : to }
  return spanDays(range) <= MAX_RANGE_DAYS ? range : null
}

const build = (
  today: DayKey,
  preset: DashboardPreset | null,
  range: DayRange,
  compare: ComparisonMode,
  choice: Granularity | null,
): DashboardView => {
  const span = spanDays(range)
  const granularityChoice = choice && allowedGranularities(span).includes(choice) ? choice : null
  return {
    today,
    preset,
    range,
    compare,
    comparison: resolveComparison({ preset, range }, compare),
    granularityChoice,
    granularity: granularityChoice ?? autoGranularity(span),
  }
}

export const parseDashboardView = (params: URLSearchParams, today: DayKey): DashboardView => {
  const custom = parseCustomRange(params, today)
  const periodo = params.get('periodo')
  const preset = custom ? null : isPreset(periodo) ? periodo : DEFAULT_PRESET
  const range = custom ?? resolvePreset(preset ?? DEFAULT_PRESET, today)
  const compare = COMPARE_FROM_PARAM[params.get('comparar') ?? ''] ?? 'previous_period'
  const choice = GRANULARITY_FROM_PARAM[params.get('agrupar') ?? ''] ?? null
  return build(today, preset, range, compare, choice)
}

const serialize = (view: DashboardView): string => {
  const params = new URLSearchParams()
  if (view.preset === null) {
    params.set('de', view.range.from)
    params.set('ate', view.range.to)
  } else if (view.preset !== DEFAULT_PRESET) {
    params.set('periodo', view.preset)
  }
  if (view.compare !== 'previous_period') params.set('comparar', COMPARE_TO_PARAM[view.compare])
  if (view.granularityChoice) params.set('agrupar', GRANULARITY_TO_PARAM[view.granularityChoice])
  return params.toString()
}

export const useDashboardView = () => {
  const searchParams = useSearchParams()
  // Recalculado a cada render: o painel aberto de um dia para o outro passa a
  // mostrar "hoje" de verdade na próxima interação.
  const today = spDayKey(new Date())
  const view = useMemo(
    () => parseDashboardView(new URLSearchParams(searchParams.toString()), today),
    [searchParams, today],
  )

  const update = useCallback(
    (change: DashboardViewChange) => {
      const preset = change.preset !== undefined ? change.preset : view.preset
      const range = change.range ?? (preset ? resolvePreset(preset, today) : view.range)
      const next = build(
        today,
        preset,
        range,
        change.compare ?? view.compare,
        change.granularityChoice !== undefined ? change.granularityChoice : view.granularityChoice,
      )
      const query = serialize(next)
      // replaceState e não push: trocar de período é ajustar a mesma tela, e o
      // "voltar" do navegador deve sair do painel, não desfazer filtro por filtro.
      // O Next sincroniza o useSearchParams com a History API nativa.
      window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
    },
    [view, today],
  )

  return { view, update }
}
