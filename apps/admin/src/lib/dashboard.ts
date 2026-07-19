import { useQuery } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type { DashboardOverview, DashboardRange } from '@ecommerce/shared/contracts'
import { apiFetch } from './api'

export const useDashboard = (range: DashboardRange) =>
  useQuery({
    queryKey: ['dashboard', range],
    queryFn: () => apiFetch<DashboardOverview>(`${ROUTES.dashboard.overview}?range=${range}`),
  })
