'use client'

import { ArrowDown, ShoppingBag, TicketPercent } from 'lucide-react'
import type {
  DashboardCoupon,
  DashboardFunnel,
  PaymentMethodBreakdown,
  RevenueBreakdown,
} from '@ecommerce/shared/contracts'
import type { PaymentMethod } from '@ecommerce/shared/constants'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatBRL } from '@/lib/utils'
import { CARD_DEFINITIONS } from './definitions'
import { formatCount, formatDay, formatPercent } from './format'
import { DashboardCard, EmptyState, ShareBar, type ShareSegment } from './parts'

export function RevenueBreakdownCard({ breakdown }: { breakdown: RevenueBreakdown }) {
  const rows: Array<{ label: string; value: number; sign: '' | '−' | '+' }> = [
    { label: 'Vendas de produtos', value: breakdown.grossSales, sign: '' },
    { label: 'Descontos', value: breakdown.discounts, sign: '−' },
    { label: 'Frete cobrado', value: breakdown.shipping, sign: '+' },
    { label: 'Reembolsos', value: breakdown.refunds, sign: '−' },
  ]

  return (
    <DashboardCard title="Composição da receita" info={CARD_DEFINITIONS.revenue}>
      {breakdown.grossSales === 0 && breakdown.shipping === 0 ? (
        <EmptyState icon={ShoppingBag}>Nenhuma venda no período.</EmptyState>
      ) : (
        <dl className="flex flex-col gap-2.5 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="tabular-nums">
                {row.sign && row.value > 0 ? `${row.sign} ` : ''}
                {formatBRL(row.value)}
              </dd>
            </div>
          ))}
          <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <dt className="font-medium">Receita líquida</dt>
            <dd className="text-base font-semibold tabular-nums">{formatBRL(breakdown.netRevenue)}</dd>
          </div>
        </dl>
      )}
    </DashboardCard>
  )
}

/**
 * Das visitas aos pedidos pagos. Os números ficam em linhas com a taxa de
 * passagem entre elas — barras proporcionais seriam inúteis aqui: com 4.000
 * visitas e 100 pedidos, a barra dos pedidos teria 2% da largura.
 */
export function FunnelCard({ funnel, trafficSince }: { funnel: DashboardFunnel; trafficSince: string | null }) {
  const steps = [
    { label: 'Visitas', value: funnel.visits, next: 'fizeram pedido' },
    { label: 'Pedidos feitos', value: funnel.created as number | null, next: 'foram pagos' },
    { label: 'Pedidos pagos', value: funnel.paid as number | null, next: '' },
  ]

  const segments: ShareSegment[] = [
    { key: 'paid', label: 'Pagos', value: funnel.paid, valueLabel: formatCount(funnel.paid), color: 1 },
    {
      key: 'awaiting',
      label: 'Aguardando pagamento',
      value: funnel.awaitingPayment,
      valueLabel: formatCount(funnel.awaitingPayment),
      color: 4,
    },
    { key: 'canceled', label: 'Cancelados', value: funnel.canceled, valueLabel: formatCount(funnel.canceled), color: 2 },
  ]

  return (
    <DashboardCard title="Funil de conversão" info={CARD_DEFINITIONS.funnel}>
      <ol className="flex flex-col">
        {steps.map((step, i) => {
          const following = steps[i + 1]
          const rate =
            following && step.value && following.value !== null ? following.value / step.value : null
          return (
            <li key={step.label} className="flex flex-col">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">{step.label}</span>
                <span className="text-lg font-semibold">
                  {step.value === null ? '—' : formatCount(step.value)}
                </span>
              </div>
              {step.value === null && (
                <span className="text-xs text-muted-foreground">
                  {trafficSince ? `contadas desde ${formatDay(trafficSince)}` : 'a contagem começa agora'}
                </span>
              )}
              {following && (
                <div className="my-1.5 flex items-center gap-2 pl-1 text-xs text-muted-foreground">
                  <ArrowDown className="size-3.5" aria-hidden />
                  {rate === null ? '—' : `${formatPercent(rate)} ${step.next}`}
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {funnel.created > 0 && (
        <div className="border-t border-border pt-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">O que aconteceu com os pedidos feitos</p>
          <ShareBar segments={segments} />
        </div>
      )}
    </DashboardCard>
  )
}

const METHOD_LABEL: Record<PaymentMethod, string> = { PIX: 'Pix', CARD: 'Cartão', BOLETO: 'Boleto' }
const METHOD_COLOR: Record<PaymentMethod, ShareSegment['color']> = { PIX: 1, CARD: 2, BOLETO: 3 }

export function PaymentMethodsCard({ methods }: { methods: PaymentMethodBreakdown[] }) {
  const segments: ShareSegment[] = methods.map((m) => ({
    key: m.method ?? 'none',
    label: m.method ? METHOD_LABEL[m.method] : 'Não informado',
    value: m.revenue,
    valueLabel: formatBRL(m.revenue),
    color: m.method ? METHOD_COLOR[m.method] : 'neutral',
    detail: `${formatCount(m.orders)} ${m.orders === 1 ? 'pedido' : 'pedidos'}`,
  }))

  return (
    <DashboardCard title="Meios de pagamento" info={CARD_DEFINITIONS.payments}>
      {segments.length === 0 ? (
        <EmptyState>Nenhuma venda no período.</EmptyState>
      ) : (
        <>
          <ShareBar segments={segments} />
          <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
            {methods
              .filter((m) => m.method)
              .map((m) => (
                <div key={m.method} className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Ticket médio · {METHOD_LABEL[m.method!]}</dt>
                  <dd className="font-medium">{formatBRL(m.orders > 0 ? Math.round(m.revenue / m.orders) : 0)}</dd>
                </div>
              ))}
          </dl>
        </>
      )}
    </DashboardCard>
  )
}

export function CouponsCard({ coupons }: { coupons: DashboardCoupon[] }) {
  return (
    <DashboardCard title="Cupons" info={CARD_DEFINITIONS.coupons}>
      {coupons.length === 0 ? (
        <EmptyState icon={TicketPercent}>Nenhuma venda com cupom no período.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cupom</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead className="text-right">Desconto</TableHead>
              <TableHead className="text-right">Receita</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.slice(0, 8).map((c) => (
              <TableRow key={c.code}>
                <TableCell className="font-mono text-xs font-medium">{c.code}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(c.orders)}</TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">{formatBRL(c.discount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatBRL(c.revenue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </DashboardCard>
  )
}
