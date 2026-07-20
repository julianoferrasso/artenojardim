'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { OrderSituation } from '@ecommerce/shared/contracts'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { OrderSituationBadge } from '@/components/order-situation-badge'
import { useOrders } from '@/lib/orders'
import { SITUATION_LABEL, SITUATION_ORDER, SORT_OPTIONS } from '@/lib/order-labels'
import { formatBRL, formatDate } from '@/lib/utils'

/** Sentinela do Select: Radix não aceita SelectItem com value="". */
const ALL = 'all'

export default function OrdersPage() {
  const [situation, setSituation] = useState<string>(ALL)
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState('-createdAt')
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useOrders({
    situation: situation === ALL ? undefined : (situation as OrderSituation),
    q: q || undefined,
    from: from || undefined,
    to: to || undefined,
    sort,
    page,
  })

  // Trocar filtro/busca/ordenação volta para a primeira página: senão o operador
  // filtra e cai numa página 4 vazia.
  const resetPage = () => setPage(1)

  const hasFilters = situation !== ALL || q || from || to
  const clear = () => {
    setSituation(ALL)
    setQ('')
    setFrom('')
    setTo('')
    resetPage()
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Pedidos</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="busca">Buscar</Label>
          <Input
            id="busca"
            value={q}
            onChange={(e) => { setQ(e.target.value); resetPage() }}
            placeholder="Nº do pedido, e-mail ou nome"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="situacao">Situação</Label>
          <Select
            value={situation}
            onValueChange={(v: string) => { setSituation(v); resetPage() }}
          >
            <SelectTrigger id="situacao" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {SITUATION_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {SITUATION_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="de">De</Label>
          <Input
            id="de"
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); resetPage() }}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ate">Até</Label>
          <Input
            id="ate"
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); resetPage() }}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ordem">Ordenar</Label>
          <Select value={sort} onValueChange={(v: string) => { setSort(v); resetPage() }}>
            <SelectTrigger id="ordem" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
          <Button variant="ghost" onClick={clear}>
            Limpar
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">Não foi possível carregar os pedidos.</p>}

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {hasFilters ? 'Nenhum pedido encontrado com esses filtros.' : 'Nenhum pedido ainda.'}
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-center">Itens</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((order) => (
                <TableRow key={order.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/pedidos/${order.id}`} className="block">
                      #{order.number}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/pedidos/${order.id}`} className="block">
                      <span className="block truncate">{order.customerName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {order.email}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    <Link href={`/pedidos/${order.id}`} className="block">
                      {formatDate(order.createdAt)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    <Link href={`/pedidos/${order.id}`} className="block">
                      {order.itemCount}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/pedidos/${order.id}`} className="block">
                      <OrderSituationBadge situation={order.situation} />
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap">
                    <Link href={`/pedidos/${order.id}`} className="block">
                      {formatBRL(order.total)}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={data.meta.page <= 1}
          >
            ← Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {data.meta.total} pedidos · página {data.meta.page} de {data.meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
            disabled={data.meta.page >= data.meta.totalPages}
          >
            Próxima →
          </Button>
        </div>
      )}
    </div>
  )
}
