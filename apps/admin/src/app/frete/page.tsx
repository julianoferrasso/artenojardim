'use client'

import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { HANDLING_DAYS_MAX, shippingSettingsSchema, type ShippingSettings } from '@ecommerce/shared/contracts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import {
  useConnectShippingProvider,
  useShippingProviderStatus,
  useShippingSettings,
  useUpdateShippingSettings,
} from '@/lib/shipping'
import { formatDate } from '@/lib/utils'

export default function FretePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Frete</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        A conta do Melhor Envio que calcula os fretes da loja.
      </p>
      <div className="flex flex-col gap-6">
        <MelhorEnvioCard />
        <HandlingDaysCard />
      </div>
    </div>
  )
}

/**
 * Quantos dias úteis a loja leva para postar um pedido pronto. Entra em toda
 * data de entrega que o cliente vê, e na página do produto ("Postamos em até N
 * dias úteis"). Na encomenda, é somado depois da produção.
 */
function HandlingDaysCard() {
  const { data, isLoading, error } = useShippingSettings()

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Prazo de postagem</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Dias úteis entre a confirmação do pagamento e a postagem de um pedido pronto. A loja soma este prazo ao
        da transportadora em toda data de entrega — e, na encomenda, depois do prazo de produção.
      </p>
      {isLoading && <Skeleton className="mt-3 h-9 w-48" />}
      {error && <p className="mt-3 text-sm text-destructive">Falha ao carregar o prazo de postagem.</p>}
      {data && <HandlingDaysForm settings={data} />}
    </section>
  )
}

function HandlingDaysForm({ settings }: { settings: ShippingSettings }) {
  const save = useUpdateShippingSettings()
  const current = String(settings.handlingDays)
  const [value, setValue] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => setValue(current), [current])

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [saved])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = shippingSettingsSchema.safeParse({ handlingDays: value.trim() === '' ? Number.NaN : Number(value) })
    if (!parsed.success) {
      setError(`Informe um número inteiro de 0 a ${HANDLING_DAYS_MAX}.`)
      return
    }
    setError(null)
    save.mutate(parsed.data, {
      onSuccess: () => setSaved(true),
      onError: (err) =>
        setError(
          err instanceof ApiError && err.status === 403
            ? 'Só administradores podem mudar o prazo de postagem.'
            : 'Não foi possível salvar. Tente de novo.',
        ),
    })
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="handling-days" className="text-muted-foreground">
        Postamos em até
      </label>
      <Input
        id="handling-days"
        type="number"
        inputMode="numeric"
        min={0}
        max={HANDLING_DAYS_MAX}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setError(null)
        }}
        aria-invalid={!!error}
        className="h-9 w-20"
      />
      <span className="text-muted-foreground">dias úteis</span>
      <Button type="submit" size="sm" variant="outline" disabled={value === current || save.isPending}>
        {save.isPending ? 'Salvando…' : 'Salvar'}
      </Button>
      {saved && <span className="text-success">Salvo ✓</span>}
      {error && (
        <span role="alert" className="w-full text-destructive">
          {error}
        </span>
      )}
    </form>
  )
}

function MelhorEnvioCard() {
  const { data: status, isLoading, error } = useShippingProviderStatus()
  const connect = useConnectShippingProvider()

  const startConnection = () => {
    // A aba abre JÁ no clique: aberta depois do await, o bloqueador de pop-up
    // do navegador a trataria como pop-up não solicitado.
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    connect.mutate(undefined, {
      onSuccess: ({ authorizeUrl }) => {
        if (tab) tab.location.href = authorizeUrl
        else window.location.href = authorizeUrl
      },
      onError: () => tab?.close(),
    })
  }

  const connectError =
    connect.error instanceof ApiError && connect.error.status === 403
      ? 'Só administradores podem conectar a conta do Melhor Envio.'
      : 'Não foi possível iniciar a conexão. Tente novamente.'

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold">Melhor Envio</h2>
        {status && (
          <Badge
            variant={status.connected ? 'outline' : 'destructive'}
            className={status.connected ? 'border-success/30 bg-success/15 text-success' : undefined}
          >
            {status.connected ? 'Conectado' : 'Desconectado'}
          </Badge>
        )}
      </div>

      {isLoading && <Skeleton className="mt-3 h-10 w-full" />}
      {error && <p className="mt-3 text-sm text-destructive">Falha ao carregar o status do frete.</p>}

      {status && (
        <p className="mt-3 text-sm text-muted-foreground">
          {status.connected
            ? `A loja está calculando fretes. O acesso se renova sozinho${
                status.expiresAt ? ` (vencimento atual: ${formatDate(status.expiresAt)})` : ''
              }.`
            : 'A loja NÃO está calculando fretes: o cliente não consegue fechar o pedido. Conecte a conta do Melhor Envio da loja (a que tem o saldo).'}
        </p>
      )}

      {status && (
        <div className="mt-4 flex flex-col gap-2">
          <Button
            className="w-fit"
            variant={status.connected ? 'outline' : 'default'}
            onClick={startConnection}
            disabled={connect.isPending}
          >
            <ExternalLink />
            {status.connected ? 'Reconectar' : 'Conectar'}
          </Button>
          {connect.isError && <p className="text-sm text-destructive">{connectError}</p>}
          <p className="text-xs text-muted-foreground">
            Abre o Melhor Envio numa nova aba. Depois de autorizar, volte para esta aba.
          </p>
        </div>
      )}
    </section>
  )
}
