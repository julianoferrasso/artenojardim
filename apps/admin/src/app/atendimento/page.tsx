'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SupportThreadListItem, SupportView } from '@ecommerce/shared/contracts'
import { SUPPORT_TOPIC_LABEL } from '@ecommerce/shared/constants'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CancelRequestedBadge, SupportStatusBadge } from '@/components/support-status-badge'
import { SUPPORT_AUTHOR_LABEL, useSupportSummary, useSupportThreads } from '@/lib/support'
import { ApiError } from '@/lib/api'
import { formatDate, formatRelative } from '@/lib/utils'

const VIEWS: Array<{ value: SupportView; label: string }> = [
  { value: 'OPEN', label: 'Aguardando resposta' },
  { value: 'CANCEL_REQUESTS', label: 'Cancelamentos pendentes' },
  { value: 'ANSWERED', label: 'Respondidas' },
  { value: 'CLOSED', label: 'Encerradas' },
  { value: 'ALL', label: 'Todas' },
]

const EMPTY: Record<SupportView, string> = {
  OPEN: 'Nenhum cliente esperando resposta.',
  CANCEL_REQUESTS: 'Nenhum pedido de cancelamento esperando decisão.',
  ANSWERED: 'Nenhuma conversa respondida.',
  CLOSED: 'Nenhuma conversa encerrada.',
  ALL: 'Nenhuma conversa ainda.',
}

/** Busca dispara depois de uma pausa na digitação, não a cada tecla. */
const SEARCH_DELAY_MS = 300

export default function SupportPage() {
  const router = useRouter()
  const [view, setView] = useState<SupportView>('OPEN')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const next = search.trim()
    if (next === q) return
    // Busca nova volta para a primeira página: senão cai numa página 4 vazia.
    const timer = setTimeout(() => {
      setQ(next)
      setPage(1)
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [search, q])

  const { data, isLoading, error } = useSupportThreads({ view, q: q || undefined, page })
  const { data: summary } = useSupportSummary()

  const counts: Partial<Record<SupportView, number>> = {
    OPEN: summary?.awaitingReply,
    CANCEL_REQUESTS: summary?.cancelRequests,
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Atendimento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mensagens dos clientes sobre os pedidos. A resposta chega ao cliente por e-mail e na
          página do pedido.
        </p>
      </div>

      <Tabs
        value={view}
        onValueChange={(v: string) => {
          setView(v as SupportView)
          setPage(1)
        }}
      >
        {/* Cinco abas não cabem no celular: rolam na horizontal em vez de quebrar. */}
        <div className="-mx-6 overflow-x-auto px-6">
          <TabsList>
            {VIEWS.map((v) => {
              const count = counts[v.value]
              return (
                <TabsTrigger key={v.value} value={v.value}>
                  {v.label}
                  {count !== undefined && count > 0 && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs leading-none text-primary-foreground tabular-nums">
                      {count}
                    </span>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>
      </Tabs>

      <div className="flex flex-col gap-1.5 sm:max-w-md">
        <Label htmlFor="busca">Buscar</Label>
        <Input
          id="busca"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nº do pedido, nome ou e-mail"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : 'Não foi possível carregar as conversas.'}
        </p>
      )}

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {q ? 'Nenhuma conversa encontrada para essa busca.' : EMPTY[view]}
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="w-24">Pedido</TableHead>
                <TableHead>Última mensagem</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  onOpen={() => router.push(`/atendimento/${thread.id}`)}
                />
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
            {data.meta.total} conversas · página {data.meta.page} de {data.meta.totalPages}
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

/**
 * A linha inteira abre a conversa; o link do pedido é a exceção e por isso para
 * a propagação. O nome do cliente é um link de verdade para quem navega por teclado.
 */
const ThreadRow = ({ thread, onOpen }: { thread: SupportThreadListItem; onOpen: () => void }) => {
  // Em "aguardando", o que importa é há quanto tempo o cliente espera, não a última mensagem.
  const waitingSince = thread.status === 'OPEN' ? thread.lastCustomerMessageAt : null
  const when = waitingSince ?? thread.lastMessageAt

  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell>
        <div className="max-w-56">
          <Link
            href={`/atendimento/${thread.id}`}
            className="block truncate font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {thread.customerName}
          </Link>
          <span className="block truncate text-xs text-muted-foreground">
            {thread.customerEmail}
          </span>
        </div>
      </TableCell>

      <TableCell className="font-medium whitespace-nowrap">
        {thread.orderId && thread.orderNumber !== null ? (
          <Link
            href={`/pedidos/${thread.orderId}`}
            className="text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            #{thread.orderNumber}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell>
        {thread.preview ? (
          <div className="max-w-xs md:max-w-md">
            <span className="block truncate text-xs text-muted-foreground">
              {SUPPORT_AUTHOR_LABEL[thread.preview.author]}
              {thread.preview.topic && ` · ${SUPPORT_TOPIC_LABEL[thread.preview.topic]}`}
            </span>
            <span className="block truncate">{thread.preview.body}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell
        className="text-xs whitespace-nowrap text-muted-foreground"
        title={formatDate(when)}
      >
        {waitingSince ? `aguardando ${formatRelative(waitingSince)}` : formatRelative(when)}
      </TableCell>

      <TableCell>
        <div className="flex flex-wrap gap-1">
          <SupportStatusBadge status={thread.status} />
          {thread.cancelRequested && <CancelRequestedBadge />}
        </div>
      </TableCell>
    </TableRow>
  )
}
