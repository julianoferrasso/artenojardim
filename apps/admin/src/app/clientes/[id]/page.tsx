'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import type { AdminCustomer } from '@ecommerce/shared/contracts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { CopyButton } from '@/components/copy-button'
import { OrderSituationBadge } from '@/components/order-situation-badge'
import { CustomerEditDialog } from '@/components/customer-edit-dialog'
import { useCustomer } from '@/lib/customers'
import { useOrders } from '@/lib/orders'
import { accountState, formatDocument, maskDocument, VERIFIED_BADGE_CLASS } from '@/lib/customer-labels'
import { formatPhone, formatZip } from '@/lib/order-labels'
import { cn, formatBRL, formatDate } from '@/lib/utils'
import { ApiError } from '@/lib/api'

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: customer, isLoading, error } = useCustomer(id)

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !customer) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : 'Cliente não encontrado.'}
        </p>
        <Link href="/clientes" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Voltar para clientes
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href="/clientes"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Clientes
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{customer.name}</h1>
            <Badge
              variant="outline"
              className={cn(
                'font-medium',
                customer.emailVerified ? VERIFIED_BADGE_CLASS.yes : VERIFIED_BADGE_CLASS.no,
              )}
            >
              {customer.emailVerified ? 'E-mail confirmado' : 'E-mail pendente'}
            </Badge>
            {customer.deletedAt && (
              <Badge variant="outline" className="bg-muted text-muted-foreground">Excluído</Badge>
            )}
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {customer.email}
            <CopyButton value={customer.email} />
            · cliente desde {formatDate(customer.createdAt)}
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <StatsCard customer={customer} />
          <OrdersCard customerId={customer.id} />
          <ViewsCard customer={customer} />
          <AddressesCard customer={customer} />
        </div>

        <aside className="flex flex-col gap-6">
          <ContactCard customer={customer} />
          <AccountCard customer={customer} />
          <ActionsCard customer={customer} />
        </aside>
      </div>
    </div>
  )
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between gap-2">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="text-right">{value}</dd>
  </div>
)

function StatsCard({ customer }: { customer: AdminCustomer }) {
  const { stats } = customer
  const items = [
    { label: 'Pedidos pagos', value: String(stats.ordersCount) },
    { label: 'Total gasto', value: formatBRL(stats.totalSpent) },
    { label: 'Ticket médio', value: formatBRL(stats.averageTicket) },
    { label: 'Último pedido', value: stats.lastOrderAt ? formatDate(stats.lastOrderAt) : '—' },
  ]

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Resumo</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tracking-tight">{item.value}</dd>
          </div>
        ))}
      </dl>
      {/* Só pedido PAGO entra na conta — é o mesmo recorte do dashboard. */}
      <p className="mt-3 text-xs text-muted-foreground">
        Considera apenas pedidos com pagamento confirmado.
      </p>
    </section>
  )
}

/** Reusa o hook e o badge de pedidos: a API já filtra por cliente. */
function OrdersCard({ customerId }: { customerId: string }) {
  const { data, isLoading } = useOrders({ customerId })
  // Os 10 mais recentes: quem quiser o resto usa a tela de pedidos.
  const orders = (data?.data ?? []).slice(0, 10)

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Pedidos</h2>

      {isLoading && <Skeleton className="mt-4 h-24 w-full" />}

      {!isLoading && orders.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Este cliente ainda não fez pedidos.</p>
      )}

      {orders.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/pedidos/${order.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:text-primary"
              >
                <span className="font-medium">#{order.number}</span>
                <span className="text-muted-foreground">{formatDate(order.createdAt)}</span>
                <OrderSituationBadge situation={order.situation} />
                <span className="font-medium">{formatBRL(order.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ViewsCard({ customer }: { customer: AdminCustomer }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Produtos visualizados</h2>

      {customer.recentViews.length === 0 ? (
        // Texto honesto: o registro começou agora, e sem esta frase a tela vazia
        // parece defeito nas primeiras semanas.
        <p className="mt-4 text-sm text-muted-foreground">
          Nenhuma visualização registrada. O histórico começa a partir de agora e só vale para
          clientes que navegam logados.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {customer.recentViews.map((view) => (
            <li key={view.productId} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <Link href={`/produtos/${view.productId}`} className="truncate font-medium hover:text-primary">
                {view.name}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">
                {view.count > 1 ? `${view.count} vezes · ` : ''}
                {formatDate(view.viewedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AddressesCard({ customer }: { customer: AdminCustomer }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Endereços</h2>

      {customer.addresses.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum endereço cadastrado.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {customer.addresses.map((address) => (
            <li key={address.id} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{address.recipient}</span>
                {address.isDefault && (
                  <Badge variant="secondary" className="text-xs">Padrão</Badge>
                )}
                {address.label && (
                  <span className="text-xs text-muted-foreground">{address.label}</span>
                )}
              </div>
              <p className="text-muted-foreground">
                {address.street}, {address.number}
                {address.complement ? ` - ${address.complement}` : ''} · {address.district}
              </p>
              <p className="text-muted-foreground">
                {address.city} - {address.state} · CEP {formatZip(address.zipCode)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ContactCard({ customer }: { customer: AdminCustomer }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Contato e preferências</h2>
      <dl className="mt-3 flex flex-col gap-2 text-sm">
        <Row label="Telefone" value={formatPhone(customer.phone)} />
        <Row
          label="CPF/CNPJ"
          value={
            customer.document ? (
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                className="inline-flex items-center gap-1 hover:text-primary"
                title={revealed ? 'Ocultar' : 'Mostrar'}
              >
                {revealed ? formatDocument(customer.document) : maskDocument(customer.document)}
                {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            ) : (
              '—'
            )
          }
        />
        <Row
          label="Nascimento"
          value={customer.birthDate ? formatDate(customer.birthDate) : '—'}
        />
        <Separator className="my-1" />
        <Row
          label="E-mails de marketing"
          value={customer.acceptsMarketing ? 'Aceita' : 'Não aceita'}
        />
        <Row
          label="Newsletter"
          value={
            customer.newsletter
              ? customer.newsletter.unsubscribedAt
                ? `Cancelou em ${formatDate(customer.newsletter.unsubscribedAt)}`
                : `Inscrito em ${formatDate(customer.newsletter.subscribedAt)}`
              : 'Não inscrito'
          }
        />
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        O cliente também controla o marketing na área da conta dele.
      </p>
    </section>
  )
}

function AccountCard({ customer }: { customer: AdminCustomer }) {
  const { activity } = customer

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Conta e acesso</h2>
      <p className="mt-2 text-sm text-muted-foreground">{accountState(customer)}</p>

      <dl className="mt-3 flex flex-col gap-2 text-sm">
        <Row
          label="Último acesso"
          value={customer.lastLoginAt ? formatDate(customer.lastLoginAt) : 'Nunca acessou'}
        />
        <Row label="Sessões ativas" value={String(activity.activeSessions)} />
        <Row
          label="Carrinho aberto"
          value={
            activity.openCartItems > 0
              ? `${activity.openCartItems} ${activity.openCartItems === 1 ? 'item' : 'itens'}`
              : 'Vazio'
          }
        />
        {activity.openCartUpdatedAt && activity.openCartItems > 0 && (
          <Row label="Mexeu no carrinho" value={formatDate(activity.openCartUpdatedAt)} />
        )}
      </dl>

      {activity.lastDevice && (
        <p className="mt-3 truncate text-xs text-muted-foreground" title={activity.lastDevice}>
          Último dispositivo: {activity.lastDevice}
        </p>
      )}
    </section>
  )
}

/**
 * Ações do staff sobre o cliente.
 *
 * A anonimização (LGPD) NÃO tem botão aqui de propósito: é irreversível e o
 * pedido de eliminação é raro o bastante para não valer um gatilho permanente ao
 * lado de "Editar" — um clique errado destrói dado que não volta. O endpoint
 * continua existindo (`POST /admin/customers/:id/anonymize`, exige ADMIN) para
 * quando um cliente exercer esse direito; ver docs/arquitetura.md.
 */
function ActionsCard({ customer }: { customer: AdminCustomer }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Ações</h2>
      <div className="mt-3 flex flex-col gap-2">
        <CustomerEditDialog customer={customer} />
      </div>
    </section>
  )
}
