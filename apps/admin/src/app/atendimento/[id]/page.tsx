'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Lock, LockOpen, Send } from 'lucide-react'
import type { AdminSupportMessage, SupportThread, SupportThreadOrder } from '@ecommerce/shared/contracts'
import { SUPPORT_TOPIC_LABEL } from '@ecommerce/shared/constants'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { OrderSituationBadge } from '@/components/order-situation-badge'
import { SupportStatusBadge } from '@/components/support-status-badge'
import { CancelRequestCard } from '@/components/cancel-request-card'
import { useReplySupport, useSetSupportStatus, useSupportThread } from '@/lib/support'
import { FULFILLMENT_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from '@/lib/order-labels'
import { ApiError } from '@/lib/api'
import { cn, formatBRL, formatDate } from '@/lib/utils'

const REPLY_MAX = 2000

export default function SupportThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: thread, isLoading, error } = useSupportThread(id)

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !thread) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <p className="text-sm text-destructive">
          {error instanceof ApiError ? error.message : 'Conversa não encontrada.'}
        </p>
        <Link href="/atendimento" className="mt-4 inline-block text-sm text-primary hover:underline">
          ← Voltar para o atendimento
        </Link>
      </div>
    )
  }

  const { order } = thread

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <ThreadHeader thread={thread} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Conversation thread={thread} />
          <ReplyBox thread={thread} />
        </div>

        <aside className="flex flex-col gap-6">
          {order?.cancelRequest && (
            <CancelRequestCard
              orderId={order.id}
              cancelRequest={order.cancelRequest}
              refundableAmount={order.refundableAmount}
            />
          )}
          {order && <OrderCard order={order} />}
          <CustomerCard customer={thread.customer} />
        </aside>
      </div>
    </div>
  )
}

const ThreadHeader = ({ thread }: { thread: SupportThread }) => {
  const setStatus = useSetSupportStatus(thread.id)
  const [error, setError] = useState<string | null>(null)
  const closed = thread.status === 'CLOSED'

  const toggle = async () => {
    setError(null)
    try {
      await setStatus.mutateAsync({ status: closed ? 'OPEN' : 'CLOSED' })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível alterar a conversa.')
    }
  }

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href="/atendimento"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Atendimento
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="truncate text-xl font-semibold tracking-tight">{thread.customer.name}</h1>
          <SupportStatusBadge status={thread.status} />
        </div>
        <p className="text-xs text-muted-foreground">
          {thread.order ? (
            <Link href={`/pedidos/${thread.order.id}`} className="text-primary hover:underline">
              Pedido #{thread.order.number}
            </Link>
          ) : (
            'Sem pedido'
          )}
          {' · '}aberta em {formatDate(thread.createdAt)}
          {thread.closedAt && ` · encerrada em ${formatDate(thread.closedAt)}`}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1">
        <Button variant="outline" size="sm" disabled={setStatus.isPending} onClick={() => void toggle()}>
          {closed ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
          {closed ? 'Reabrir' : 'Encerrar'}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </header>
  )
}

const Conversation = ({ thread }: { thread: SupportThread }) => (
  <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
    <h2 className="text-sm font-semibold">Conversa</h2>

    <ol className="mt-4 flex flex-col gap-4">
      {thread.messages.map((message) => (
        <MessageBubble key={message.id} message={message} customerName={thread.customer.name} />
      ))}
      {thread.messages.length === 0 && (
        <li className="text-sm text-muted-foreground">Nenhuma mensagem nesta conversa.</li>
      )}
    </ol>
  </section>
)

/** Cliente à esquerda, loja à direita, sistema no meio e discreto — a leitura de um chat. */
const MessageBubble = ({
  message,
  customerName,
}: {
  message: AdminSupportMessage
  customerName: string
}) => {
  const topic = message.topic ? SUPPORT_TOPIC_LABEL[message.topic] : null

  if (message.author === 'SYSTEM') {
    return (
      <li className="flex justify-center">
        <div className="max-w-md rounded-md border border-dashed border-border px-3 py-2 text-center text-xs text-muted-foreground">
          <p className="whitespace-pre-wrap">{message.body}</p>
          <p className="mt-1">
            Sistema · {formatDate(message.createdAt)}
            {topic && ` · ${topic}`}
          </p>
        </div>
      </li>
    )
  }

  const fromStore = message.author === 'STAFF'
  const author = fromStore ? (message.authorName ?? 'Loja') : customerName

  return (
    <li className={cn('flex', fromStore ? 'justify-end pl-8 sm:pl-16' : 'justify-start pr-8 sm:pr-16')}>
      <div
        className={cn(
          'min-w-0 rounded-lg border px-4 py-3',
          fromStore
            ? 'rounded-tr-sm border-primary/20 bg-primary/10'
            : 'rounded-tl-sm border-border bg-muted',
        )}
      >
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-semibold">{author}</span>
          {fromStore && <span className="text-muted-foreground">pela loja</span>}
          {topic && <span className="text-muted-foreground">· {topic}</span>}
        </p>
        <p className="mt-1 text-sm break-words whitespace-pre-wrap">{message.body}</p>
        <p className="mt-1 text-xs text-muted-foreground">{formatDate(message.createdAt)}</p>
      </div>
    </li>
  )
}

const ReplyBox = ({ thread }: { thread: SupportThread }) => {
  const reply = useReplySupport(thread.id)
  const [body, setBody] = useState('')
  const [close, setClose] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = async () => {
    const text = body.trim()
    if (!text) return
    setError(null)
    try {
      await reply.mutateAsync({ body: text, close })
      setBody('')
      setClose(false)
      setSent(true)
      setTimeout(() => setSent(false), 2000)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Não foi possível enviar a resposta.')
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <label htmlFor="support-reply" className="text-sm font-semibold">
        Responder
      </label>
      <p className="mt-1 text-xs text-muted-foreground">
        O cliente recebe a resposta por e-mail e na página do pedido.
        {thread.status === 'CLOSED' && ' A conversa está encerrada: responder a reabre.'}
      </p>

      <Textarea
        id="support-reply"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        maxLength={REPLY_MAX}
        className="mt-3"
        placeholder={`Escreva para ${thread.customer.name}`}
      />
      <div className="mt-1 flex justify-end text-xs text-muted-foreground tabular-nums">
        {body.length}/{REPLY_MAX}
      </div>

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={close}
            onChange={(e) => setClose(e.target.checked)}
            className="size-4"
          />
          Encerrar a conversa após responder
        </label>
        <div className="flex items-center gap-2">
          {sent && <span className="text-xs text-success">Enviada ✓</span>}
          <Button disabled={!body.trim() || reply.isPending} onClick={() => void submit()}>
            <Send className="size-4" />
            {reply.isPending ? 'Enviando…' : 'Enviar resposta'}
          </Button>
        </div>
      </div>
    </section>
  )
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between gap-2">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="text-right">{value}</dd>
  </div>
)

const OrderCard = ({ order }: { order: SupportThreadOrder }) => (
  <section className="rounded-lg border border-border bg-card p-4">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">Pedido #{order.number}</h2>
      <OrderSituationBadge situation={order.situation} />
    </div>

    <dl className="mt-3 flex flex-col gap-1.5 text-sm">
      <Row label="Total" value={formatBRL(order.total)} />
      <Row
        label="Pagamento"
        value={
          order.paymentMethod
            ? `${PAYMENT_METHOD_LABEL[order.paymentMethod]} · ${PAYMENT_STATUS_LABEL[order.paymentStatus]}`
            : PAYMENT_STATUS_LABEL[order.paymentStatus]
        }
      />
      <Row label="Expedição" value={FULFILLMENT_LABEL[order.fulfillmentStatus]} />
      <Row label="Feito em" value={formatDate(order.createdAt)} />
      {order.canceledAt && <Row label="Cancelado em" value={formatDate(order.canceledAt)} />}
    </dl>

    {order.canceledAt && order.refundableAmount > 0 && (
      <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Cancelado com estorno pendente de {formatBRL(order.refundableAmount)} — use “Reembolsar” na
        tela do pedido.
      </p>
    )}

    <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
      <Link href={`/pedidos/${order.id}`}>Abrir pedido</Link>
    </Button>
  </section>
)

const CustomerCard = ({ customer }: { customer: SupportThread['customer'] }) => (
  <section className="rounded-lg border border-border bg-card p-4">
    <h2 className="text-sm font-semibold">Cliente</h2>
    <div className="mt-2 flex flex-col gap-1 text-sm">
      <Link href={`/clientes/${customer.id}`} className="font-medium hover:underline">
        {customer.name}
      </Link>
      <a href={`mailto:${customer.email}`} className="truncate text-primary hover:underline">
        {customer.email}
      </a>
    </div>
  </section>
)
