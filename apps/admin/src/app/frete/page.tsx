'use client'

import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { useConnectShippingProvider, useShippingProviderStatus } from '@/lib/shipping'
import { formatDate } from '@/lib/utils'

export default function FretePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Frete</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        A conta do Melhor Envio que calcula os fretes da loja.
      </p>
      <MelhorEnvioCard />
    </div>
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
