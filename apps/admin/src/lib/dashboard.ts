import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type { DashboardOverview } from '@ecommerce/shared/contracts'
import type { DashboardView } from './dashboard-params'
import { apiFetch } from './api'

/** Período que inclui hoje ainda está acontecendo: o painel se atualiza sozinho. */
const LIVE_REFETCH_MS = 120_000

export const useDashboardOverview = (view: DashboardView) => {
  const { range, comparison, granularity, today } = view
  return useQuery({
    queryKey: ['dashboard', 'overview', { range, comparison, granularity }],
    queryFn: () => {
      const qs = new URLSearchParams({ from: range.from, to: range.to, granularity })
      if (comparison) {
        qs.set('compareFrom', comparison.from)
        qs.set('compareTo', comparison.to)
      }
      return apiFetch<DashboardOverview>(`${ROUTES.dashboard.overview}?${qs}`)
    },
    // Trocar de período mantém o quadro anterior na tela (esmaecido) até o novo
    // chegar, em vez de piscar um esqueleto a cada clique.
    placeholderData: keepPreviousData,
    refetchInterval: range.to >= today ? LIVE_REFETCH_MS : false,
  })
}
