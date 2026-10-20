'use client'

import { Suspense } from 'react'
import { Dashboard } from '@/components/dashboard/dashboard'

/**
 * O estado do painel vive na URL (useSearchParams), e o Next exige Suspense em
 * volta de quem lê a query numa página pré-renderizada.
 */
export default function DashboardPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  )
}
