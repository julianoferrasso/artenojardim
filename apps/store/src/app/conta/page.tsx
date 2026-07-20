'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { useMyOrders } from '@/lib/orders'
import { OrderCard } from '@/components/order-card'

/**
 * Visão geral da conta: quem é o cliente e os últimos pedidos.
 *
 * Guard, largura e navegação ficam no layout. Os três pedidos existem porque a
 * pergunta que traz alguém aqui quase sempre é "cadê o que eu comprei?" — e um
 * clique a menos para respondê-la vale a chamada extra.
 */
export default function ContaPage() {
  const { customer } = useAuth()
  const { data, isLoading } = useMyOrders({ perPage: 3 })

  if (!customer) return null

  const orders = data?.data ?? []

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Minha conta</h1>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 sm:flex-row sm:gap-10">
        <div>
          <p className="text-sm text-muted-foreground">Nome</p>
          <p className="font-medium">{customer.name}</p>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">E-mail</p>
          <p className="truncate font-medium">{customer.email}</p>
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Últimos pedidos</h2>
          {orders.length > 0 && (
            <Link href="/conta/pedidos" className="text-sm text-primary hover:underline">
              Ver todos
            </Link>
          )}
        </div>

        {isLoading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {!isLoading && orders.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">Você ainda não fez nenhum pedido.</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Ver produtos
            </Link>
          </div>
        )}

        {!isLoading && orders.length > 0 && (
          <div className="flex flex-col gap-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
