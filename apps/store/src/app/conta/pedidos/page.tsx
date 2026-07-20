'use client'

import { Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { OrderSituation, OrderPeriod } from '@ecommerce/shared/contracts'
import { useMyOrders } from '@/lib/orders'
import { OrderCard } from '@/components/order-card'
import { OrderFilters, type OrderFiltersValue } from '@/components/order-filters'
import { Pagination } from '@/components/pagination'

/**
 * Meus pedidos.
 *
 * Os filtros vivem na URL: voltar funciona, o link é compartilhável e um F5 não
 * joga o cliente de volta para a página 1 sem filtro nenhum.
 */

const OrdersList = () => {
  const router = useRouter()
  const params = useSearchParams()

  const page = Number(params.get('page') ?? '1') || 1
  const filters: OrderFiltersValue = {
    situation: (params.get('situation') as OrderSituation | null) ?? undefined,
    period: (params.get('period') as OrderPeriod | null) ?? 'all',
    q: params.get('q') ?? '',
  }

  const push = useCallback(
    (next: Partial<OrderFiltersValue & { page: number }>) => {
      const qs = new URLSearchParams(params.toString())

      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === '' || value === 'all') qs.delete(key)
        else qs.set(key, String(value))
      }
      // Mudar filtro ou busca volta para a primeira página: senão o cliente
      // filtra e cai numa página 3 vazia, achando que não tem pedido nenhum.
      if (!('page' in next)) qs.delete('page')

      router.replace(`/conta/pedidos${qs.toString() ? `?${qs}` : ''}`, { scroll: false })
    },
    [params, router],
  )

  const { data, isLoading, isError, refetch, isFetching } = useMyOrders({
    page,
    situation: filters.situation,
    period: filters.period,
    q: filters.q || undefined,
  })

  const orders = data?.data ?? []
  const hasFilters = !!filters.situation || filters.period !== 'all' || !!filters.q

  return (
    <>
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">Meus pedidos</h1>

      <OrderFilters
        value={filters}
        onChange={push}
        onClear={() => router.replace('/conta/pedidos', { scroll: false })}
      />

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          Não foi possível carregar seus pedidos.
          <button type="button" onClick={() => void refetch()} className="ml-2 underline">
            Tentar novamente
          </button>
        </div>
      )}

      {!isLoading && !isError && orders.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          {hasFilters ? (
            <>
              <p className="text-sm text-muted-foreground">
                Nenhum pedido encontrado com esses filtros.
              </p>
              <button
                type="button"
                onClick={() => router.replace('/conta/pedidos', { scroll: false })}
                className="mt-3 text-sm text-primary hover:underline"
              >
                Limpar filtros
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Você ainda não fez nenhum pedido.</p>
              <Link
                href="/"
                className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition-all duration-200 hover:bg-primary/90"
              >
                Ver produtos
              </Link>
            </>
          )}
        </div>
      )}

      {orders.length > 0 && (
        <>
          {/* Opacidade durante o refetch: a lista antiga continua legível
              (keepPreviousData) mas fica claro que algo está carregando. */}
          <div
            className={`flex flex-col gap-3 transition-opacity ${isFetching ? 'opacity-60' : ''}`}
          >
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>

          {data && (
            <Pagination meta={data.meta} onPageChange={(p) => push({ page: p })} label="pedidos" />
          )}
        </>
      )}
    </>
  )
}

export default function PedidosPage() {
  // useSearchParams exige Suspense em build estático do App Router.
  return (
    <Suspense fallback={<div className="h-28 animate-pulse rounded-lg bg-muted" />}>
      <OrdersList />
    </Suspense>
  )
}
