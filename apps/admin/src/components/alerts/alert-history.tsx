'use client'

import { Check, X } from 'lucide-react'
import { ALERT_EVENT_CATALOG } from '@ecommerce/shared/constants'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useAlertHistory } from '@/lib/alerts'
import { formatDate, formatRelative } from '@/lib/utils'
import { ChannelIcon } from './channel-icon'

/** Depois disso sem entrega nenhuma, não é mais "enviando": a fila não pegou. */
const STILL_SENDING_MS = 5 * 60_000

export const AlertHistory = ({ enabled }: { enabled: boolean }) => {
  const { data, isLoading, error } = useAlertHistory(enabled)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )
  }

  if (error) return <p className="text-sm text-destructive">Falha ao carregar o histórico.</p>

  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhum alerta enviado ainda. Quando um evento acontecer, ele aparece aqui com o resultado de cada envio.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {data.map((item) => {
        const sending = Date.now() - Date.parse(item.createdAt) < STILL_SENDING_MS
        return (
          <li key={item.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {ALERT_EVENT_CATALOG[item.type].label} ·{' '}
                <time dateTime={item.createdAt} title={formatDate(item.createdAt)}>
                  {formatRelative(item.createdAt)}
                </time>
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:justify-end">
              {item.deliveries.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  {sending ? 'Enviando…' : 'Nenhuma entrega registrada'}
                </span>
              ) : (
                item.deliveries.map((d) => (
                  <Badge
                    key={d.destinationId}
                    variant="outline"
                    title={d.error ?? `Entregue em ${formatDate(d.at)}`}
                    className={
                      d.delivered
                        ? 'border-success/30 bg-success/15 text-success'
                        : 'border-destructive/30 bg-destructive/10 text-destructive'
                    }
                  >
                    {d.delivered ? <Check aria-label="entregue" /> : <X aria-label="falhou" />}
                    <ChannelIcon channel={d.channel} />
                    {d.label}
                  </Badge>
                ))
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
