'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Campaign } from '@ecommerce/shared/contracts'
import { Badge } from '@/components/ui/badge'
import { useCampaigns } from '@/lib/campaigns'

/**
 * Histórico de campanhas. Responde "o que já foi enviado, para quantos, e deu
 * certo?" — sem ela, EmailCampaign seria escrita e nunca lida.
 */

const KIND_LABEL: Record<string, string> = {
  NEW_PRODUCT: 'Novidade',
  MANUAL: 'Manual',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Na fila',
  SENDING: 'Enviando',
  SENT: 'Enviada',
  FAILED: 'Falhou',
}

const statusVariant = (status: string): 'default' | 'secondary' | 'destructive' =>
  status === 'FAILED' ? 'destructive' : status === 'SENT' ? 'secondary' : 'default'

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default function CampanhasPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading, error } = useCampaigns(page)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Campanhas de e-mail</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Divulgações enviadas para quem aceita novidades. Para disparar uma nova, abra o produto.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar as campanhas.
        </p>
      )}

      {data && data.data.length === 0 && (
        <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Nenhuma campanha enviada ainda. Publique um produto marcando &ldquo;avisar os
          clientes&rdquo;, ou use o botão de divulgação na tela de um produto já publicado.
        </p>
      )}

      {data && data.data.length > 0 && (
        <>
          <ul className="divide-y rounded-lg border border-border bg-card">
            {data.data.map((campaign) => (
              <CampaignRow key={campaign.id} campaign={campaign} />
            ))}
          </ul>

          {data.meta.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-accent disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-muted-foreground">
                {data.meta.total} campanhas · página {page} de {data.meta.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.meta.totalPages}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-accent disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const pending = campaign.recipientCount - campaign.sentCount - campaign.failedCount

  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium">{campaign.subject}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {/* O produto pode ter sido removido depois: o assunto acima é snapshot
              e continua contando o que o cliente leu. */}
          {campaign.productId ? (
            <Link href={`/produtos/${campaign.productId}`} className="hover:text-foreground">
              {campaign.productName ?? 'produto removido'}
            </Link>
          ) : (
            (campaign.productName ?? 'produto removido')
          )}
          {' · '}
          {formatDate(campaign.createdAt)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {campaign.sentCount}/{campaign.recipientCount} enviados
          {campaign.failedCount > 0 && (
            <span className="text-destructive"> · {campaign.failedCount} falharam</span>
          )}
          {pending > 0 && <span> · {pending} na fila</span>}
        </span>
        <Badge variant="outline">{KIND_LABEL[campaign.kind] ?? campaign.kind}</Badge>
        <Badge variant={statusVariant(campaign.status)}>
          {STATUS_LABEL[campaign.status] ?? campaign.status}
        </Badge>
      </div>
    </li>
  )
}
