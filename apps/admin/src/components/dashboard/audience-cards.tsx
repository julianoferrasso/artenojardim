'use client'

import Link from 'next/link'
import { MapPin, MousePointerClick, Users } from 'lucide-react'
import type {
  DashboardCustomers,
  DashboardState,
  DashboardTraffic,
  VisitDevice,
  VisitSource,
} from '@ecommerce/shared/contracts'
import { BR_STATES } from '@ecommerce/shared/constants'
import { Badge } from '@/components/ui/badge'
import { formatBRL } from '@/lib/utils'
import { CARD_DEFINITIONS } from './definitions'
import { formatCount, formatDay, formatPercent } from './format'
import { BarList, DashboardCard, EmptyState, ShareBar, type ShareSegment } from './parts'

export function CustomersCard({ customers }: { customers: DashboardCustomers }) {
  const segments: ShareSegment[] = [
    {
      key: 'new',
      label: 'Novos',
      value: customers.newBuyers,
      valueLabel: formatCount(customers.newBuyers),
      color: 1,
    },
    {
      key: 'returning',
      label: 'Recorrentes',
      value: customers.returningBuyers,
      valueLabel: formatCount(customers.returningBuyers),
      color: 2,
    },
  ]

  return (
    <DashboardCard title="Clientes" info={CARD_DEFINITIONS.customers}>
      <dl className="grid grid-cols-3 gap-3">
        <Stat label="Compradores" value={formatCount(customers.buyers)} />
        <Stat
          label="Recompra"
          value={formatPercent(customers.buyers > 0 ? customers.returningBuyers / customers.buyers : null)}
        />
        <Stat label="Cadastros" value={formatCount(customers.signups)} />
      </dl>

      {customers.buyers === 0 ? (
        <EmptyState icon={Users}>Nenhum comprador no período.</EmptyState>
      ) : (
        <>
          <ShareBar segments={segments} />
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Quem mais comprou</p>
            <ul className="flex flex-col gap-2 text-sm">
              {customers.top.map((c) => (
                <li key={c.customerId} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <Link href={`/clientes/${c.customerId}`} className="truncate hover:text-primary hover:underline">
                      {c.name}
                    </Link>
                    {c.isNew && (
                      <Badge variant="secondary" className="shrink-0">
                        novo
                      </Badge>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatBRL(c.revenue)}
                    <span className="text-muted-foreground">
                      {' '}
                      · {formatCount(c.orders)} {c.orders === 1 ? 'pedido' : 'pedidos'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </DashboardCard>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  )
}

const SOURCE_LABEL: Record<VisitSource, string> = {
  direct: 'Direto',
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  google: 'Google',
  email: 'E-mail',
  other: 'Outros sites',
}

const DEVICE_LABEL: Record<VisitDevice, string> = { mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet' }
const DEVICE_COLOR: Record<VisitDevice, ShareSegment['color']> = { mobile: 1, desktop: 2, tablet: 3 }

export function TrafficCard({ traffic, trafficSince }: { traffic: DashboardTraffic; trafficSince: string | null }) {
  const total = traffic.bySource.reduce((sum, s) => sum + s.visits, 0)

  return (
    <DashboardCard title="Origem das visitas" info={CARD_DEFINITIONS.traffic}>
      {trafficSince === null ? (
        <EmptyState icon={MousePointerClick}>
          A contagem de visitas começou agora. Os números aparecem conforme a loja recebe visitas.
        </EmptyState>
      ) : total === 0 ? (
        <EmptyState icon={MousePointerClick}>
          Nenhuma visita registrada no período (contamos desde {formatDay(trafficSince, true)}).
        </EmptyState>
      ) : (
        <>
          <BarList
            items={traffic.bySource.map((s) => ({
              key: s.source,
              label: SOURCE_LABEL[s.source],
              value: s.visits,
              valueLabel: formatCount(s.visits),
              detail: formatPercent(s.visits / total),
            }))}
          />
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Dispositivo</p>
            <ShareBar
              segments={traffic.byDevice.map((d) => ({
                key: d.device,
                label: DEVICE_LABEL[d.device],
                value: d.visits,
                valueLabel: formatCount(d.visits),
                color: DEVICE_COLOR[d.device],
              }))}
            />
          </div>
        </>
      )}
    </DashboardCard>
  )
}

const STATE_NAME = new Map<string, string>(BR_STATES.map((s) => [s.code, s.name]))

export function StatesCard({ states }: { states: DashboardState[] }) {
  return (
    <DashboardCard title="Vendas por estado" info={CARD_DEFINITIONS.states}>
      {states.length === 0 ? (
        <EmptyState icon={MapPin}>Nenhuma venda no período.</EmptyState>
      ) : (
        <BarList
          items={states.slice(0, 10).map((s) => ({
            key: s.state,
            label: (
              <>
                <span className="font-medium">{s.state}</span>
                <span className="text-muted-foreground"> · {STATE_NAME.get(s.state) ?? s.state}</span>
              </>
            ),
            value: s.revenue,
            valueLabel: formatBRL(s.revenue),
            detail: `${formatCount(s.orders)} ${s.orders === 1 ? 'pedido' : 'pedidos'}`,
          }))}
        />
      )}
    </DashboardCard>
  )
}
