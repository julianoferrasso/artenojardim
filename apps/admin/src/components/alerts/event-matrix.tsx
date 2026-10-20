'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import {
  ALERT_EVENT_CATALOG,
  ALERT_EVENT_GROUPS,
  ALERT_EVENT_GROUP_LABEL,
  ALERT_EVENT_TYPES,
  type AlertEventType,
} from '@ecommerce/shared/constants'
import { alertSettingsSchema, type AlertDestination, type AlertSettings } from '@ecommerce/shared/contracts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { alertErrorMessage, useUpdateAlertDestination, useUpdateAlertSettings } from '@/lib/alerts'
import { cn } from '@/lib/utils'
import { ChannelIcon } from './channel-icon'

/**
 * Evento por evento, quem recebe. Cada chip é um destino confirmado: um clique
 * liga ou desliga aquele evento para ele (otimista; a lista inteira vai no PATCH).
 */
export const EventMatrix = ({
  destinations,
  settings,
}: {
  destinations: AlertDestination[]
  settings: AlertSettings
}) => {
  const update = useUpdateAlertDestination()
  const verified = destinations.filter((d) => d.verified)

  if (verified.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Confirme um destino para escolher quais alertas ele recebe.
      </div>
    )
  }

  const toggle = (d: AlertDestination, type: AlertEventType) => {
    const events = d.events.includes(type) ? d.events.filter((e) => e !== type) : [...d.events, type]
    update.mutate({ id: d.id, input: { events } })
  }

  return (
    <div className="space-y-4">
      {update.isError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {alertErrorMessage(update.error, 'Não foi possível salvar a mudança.')}
        </p>
      )}

      {ALERT_EVENT_GROUPS.map((group) => {
        const types = ALERT_EVENT_TYPES.filter((type) => ALERT_EVENT_CATALOG[type].group === group)
        return (
          <section key={group} className="rounded-lg border border-border bg-card">
            <h3 className="border-b border-border px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {ALERT_EVENT_GROUP_LABEL[group]}
            </h3>
            <ul className="divide-y divide-border">
              {types.map((type) => {
                const info = ALERT_EVENT_CATALOG[type]
                const receivers = verified.filter((d) => d.enabled && d.events.includes(type)).length
                return (
                  <li key={type} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 lg:max-w-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{info.label}</p>
                        {receivers === 0 && (
                          <Badge variant="outline" className="border-warning/30 bg-warning/15 text-warning-foreground">
                            Ninguém recebe
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{info.description}</p>
                      {type === 'LOW_STOCK' && <ThresholdForm settings={settings} />}
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {verified.map((d) => {
                        const on = d.events.includes(type)
                        return (
                          <button
                            key={d.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggle(d, type)}
                            title={d.enabled ? undefined : 'Destino pausado: não recebe nada até ser reativado.'}
                            className={cn(
                              'inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
                              on
                                ? 'border-primary bg-accent text-foreground'
                                : 'border-border text-muted-foreground hover:border-primary/50',
                              !d.enabled && 'opacity-60',
                            )}
                          >
                            <ChannelIcon channel={d.channel} className="size-3.5 shrink-0" />
                            <span className="truncate">{d.label}</span>
                            {on && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
                          </button>
                        )
                      })}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

const ThresholdForm = ({ settings }: { settings: AlertSettings }) => {
  const save = useUpdateAlertSettings()
  const current = String(settings.lowStockThreshold)
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
    const parsed = alertSettingsSchema.safeParse({
      lowStockThreshold: value.trim() === '' ? Number.NaN : Number(value),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Número inválido')
      return
    }
    setError(null)
    save.mutate(parsed.data, {
      onSuccess: () => setSaved(true),
      onError: (err) => setError(alertErrorMessage(err)),
    })
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <label htmlFor="low-stock-threshold">Avisar com</label>
      <Input
        id="low-stock-threshold"
        type="number"
        inputMode="numeric"
        min={0}
        max={999}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setError(null)
        }}
        aria-invalid={!!error}
        className="h-8 w-20"
      />
      <span>unidades ou menos disponíveis</span>
      <Button type="submit" size="sm" variant="outline" disabled={value === current || save.isPending}>
        {save.isPending ? 'Salvando…' : 'Salvar'}
      </Button>
      {saved && <span className="text-success">Salvo ✓</span>}
      {error && (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      )}
    </form>
  )
}
