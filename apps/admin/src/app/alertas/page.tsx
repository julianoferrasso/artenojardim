'use client'

import { useState } from 'react'
import { BellPlus, TriangleAlert } from 'lucide-react'
import { ALERTS_MIN_ROLE, type AlertDestination } from '@ecommerce/shared/contracts'
import { ROLE_RANK } from '@ecommerce/shared/constants'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AddDestinationDialog } from '@/components/alerts/add-destination-dialog'
import { AlertHistory } from '@/components/alerts/alert-history'
import { ChannelCards } from '@/components/alerts/channel-cards'
import { DestinationList } from '@/components/alerts/destination-list'
import { EventMatrix } from '@/components/alerts/event-matrix'
import { SetupGuideDialog } from '@/components/alerts/setup-guide-dialog'
import { useAlertsOverview } from '@/lib/alerts'
import { useAuth } from '@/lib/auth'

type Adding = { resume: AlertDestination | null }

export default function AlertsPage() {
  const { user } = useAuth()
  const allowed = !!user && ROLE_RANK[user.role] >= ROLE_RANK[ALERTS_MIN_ROLE]
  const { data, isLoading, error } = useAlertsOverview(allowed)

  const [tab, setTab] = useState('destinos')
  const [adding, setAdding] = useState<Adding | null>(null)
  const [guide, setGuide] = useState<'TELEGRAM' | 'WHATSAPP' | null>(null)

  const active = data?.destinations.filter((d) => d.verified && d.enabled).length ?? 0

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="mb-1 text-xl font-semibold tracking-tight">Alertas</h1>
          <p className="text-sm text-muted-foreground">
            Avisos da loja por e-mail, Telegram e WhatsApp. Cada destino é confirmado por um código antes de receber
            alertas.
          </p>
        </div>
        {allowed && data && (
          <Button onClick={() => setAdding({ resume: null })}>
            <BellPlus />
            Adicionar destino
          </Button>
        )}
      </div>

      {!allowed ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Só administradores configuram os alertas da loja.
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-40" />
        </div>
      ) : error || !data ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Falha ao carregar os alertas.
        </p>
      ) : (
        <>
          <ChannelCards overview={data} onGuide={setGuide} />

          {active === 0 && (
            <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>Nenhum destino ativo: a loja não está avisando ninguém sobre pedidos, mensagens e estoque.</p>
            </div>
          )}

          <Tabs value={tab} onValueChange={setTab} className="mt-6">
            <TabsList>
              <TabsTrigger value="destinos">
                Destinos
                <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{data.destinations.length}</span>
              </TabsTrigger>
              <TabsTrigger value="eventos">Eventos</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="destinos" className="pt-2">
              <DestinationList
                destinations={data.destinations}
                onAdd={() => setAdding({ resume: null })}
                onResume={(destination) => setAdding({ resume: destination })}
              />
            </TabsContent>
            <TabsContent value="eventos" className="pt-2">
              <EventMatrix destinations={data.destinations} settings={data.settings} />
            </TabsContent>
            <TabsContent value="historico" className="pt-2">
              <AlertHistory enabled={tab === 'historico'} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <AddDestinationDialog
        open={adding !== null}
        onOpenChange={(open) => !open && setAdding(null)}
        channels={data?.channels}
        resume={adding?.resume ?? null}
        onGuide={(channel) => {
          setAdding(null)
          setGuide(channel)
        }}
      />
      <SetupGuideDialog channel={guide} onClose={() => setGuide(null)} />
    </div>
  )
}
