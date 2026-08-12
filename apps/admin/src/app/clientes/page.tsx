'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, MailX } from 'lucide-react'
import type { AdminCustomerStatus, AdminCustomerTriState } from '@ecommerce/shared/contracts'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
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
import { useCustomers } from '@/lib/customers'
import {
  MARKETING_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  VERIFIED_BADGE_CLASS,
  VERIFIED_OPTIONS,
} from '@/lib/customer-labels'
import { cn, formatBRL, formatDate } from '@/lib/utils'

export default function CustomersPage() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<AdminCustomerStatus>('active')
  const [verified, setVerified] = useState<AdminCustomerTriState>('all')
  const [marketing, setMarketing] = useState<AdminCustomerTriState>('all')
  const [sort, setSort] = useState('-createdAt')
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useCustomers({ q: q || undefined, status, verified, marketing, sort, page })

  // Trocar filtro/busca/ordenação volta para a primeira página: senão o operador
  // filtra e cai numa página 4 vazia.
  const resetPage = () => setPage(1)

  const hasFilters = q !== '' || status !== 'active' || verified !== 'all' || marketing !== 'all'
  const clear = () => {
    setQ('')
    setStatus('active')
    setVerified('all')
    setMarketing('all')
    resetPage()
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Clientes</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="busca">Buscar</Label>
          <Input
            id="busca"
            value={q}
            onChange={(e) => { setQ(e.target.value); resetPage() }}
            placeholder="Nome, e-mail, CPF ou telefone"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="situacao">Situação</Label>
          <Select value={status} onValueChange={(v: string) => { setStatus(v as AdminCustomerStatus); resetPage() }}>
            <SelectTrigger id="situacao" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Select value={verified} onValueChange={(v: string) => { setVerified(v as AdminCustomerTriState); resetPage() }}>
            <SelectTrigger id="email" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VERIFIED_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="marketing">Marketing</Label>
          <Select value={marketing} onValueChange={(v: string) => { setMarketing(v as AdminCustomerTriState); resetPage() }}>
            <SelectTrigger id="marketing" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MARKETING_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ordem">Ordenar</Label>
          <Select value={sort} onValueChange={(v: string) => { setSort(v); resetPage() }}>
            <SelectTrigger id="ordem" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
          <Button variant="ghost" onClick={clear}>Limpar</Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">Não foi possível carregar os clientes.</p>}

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {hasFilters ? 'Nenhum cliente encontrado com esses filtros.' : 'Nenhum cliente ainda.'}
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="text-center">Pedidos</TableHead>
                <TableHead className="text-right">Total gasto</TableHead>
                <TableHead>Último pedido</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead className="text-center">Mkt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((customer) => {
                const href = `/clientes/${customer.id}`
                return (
                  <TableRow key={customer.id} className="cursor-pointer">
                    {/* O Link em cada célula, e não onClick na linha: preserva
                        abrir em nova aba e o foco por teclado. */}
                    <TableCell>
                      <Link href={href} className="block">
                        <span className="font-medium">{customer.name}</span>
                        {customer.deletedAt && (
                          <Badge variant="outline" className="ml-2 bg-muted text-muted-foreground">
                            Excluído
                          </Badge>
                        )}
                        <span className="block text-xs text-muted-foreground">{customer.email}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={href} className="block">
                        <Badge
                          variant="outline"
                          className={cn(
                            'font-medium',
                            customer.emailVerified
                              ? VERIFIED_BADGE_CLASS.yes
                              : VERIFIED_BADGE_CLASS.no,
                          )}
                        >
                          {customer.emailVerified ? 'Confirmado' : 'Pendente'}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">
                      <Link href={href} className="block">{customer.stats.ordersCount}</Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={href} className="block">{formatBRL(customer.stats.totalSpent)}</Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <Link href={href} className="block">
                        {customer.stats.lastOrderAt ? formatDate(customer.stats.lastOrderAt) : '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <Link href={href} className="block">
                        {customer.lastLoginAt ? formatDate(customer.lastLoginAt) : 'Nunca acessou'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">
                      <Link href={href} className="block">
                        {customer.acceptsMarketing ? (
                          <Mail className="mx-auto size-4 text-success" aria-label="Aceita e-mails" />
                        ) : (
                          <MailX
                            className="mx-auto size-4 text-muted-foreground"
                            aria-label="Não aceita e-mails"
                          />
                        )}
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
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
            {data.meta.total} clientes · página {data.meta.page} de {data.meta.totalPages}
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
