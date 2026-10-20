'use client'

import { ALERT_CHANNELS, ALERT_CHANNEL_LABEL, type AlertChannel } from '@ecommerce/shared/constants'
import type { AlertsOverview } from '@ecommerce/shared/contracts'
import { cn } from '@/lib/utils'
import { ChannelIcon } from './channel-icon'

type Tone = 'ok' | 'warn' | 'off'

const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  off: 'bg-muted-foreground/40',
}

const channelState = (channel: AlertChannel, channels: AlertsOverview['channels']): { tone: Tone; text: string } => {
  if (channel === 'EMAIL') {
    return channels.EMAIL.available
      ? { tone: 'ok', text: 'Pronto para enviar' }
      : { tone: 'off', text: 'Não configurado no servidor' }
  }
  if (channel === 'TELEGRAM') {
    const telegram = channels.TELEGRAM
    if (!telegram.available) return { tone: 'off', text: 'Não configurado' }
    if (telegram.botUsername) return { tone: 'ok', text: `Bot @${telegram.botUsername}` }
    return { tone: 'warn', text: telegram.problem ?? 'Token não confirmado pelo Telegram' }
  }
  return channels.WHATSAPP.available
    ? { tone: 'ok', text: 'Pronto para enviar' }
    : { tone: 'off', text: 'Aguardando a conta da Meta' }
}

const activeCount = (n: number): string =>
  n === 0 ? 'Nenhum destino ativo' : n === 1 ? '1 destino ativo' : `${n} destinos ativos`

export const ChannelCards = ({
  overview,
  onGuide,
}: {
  overview: AlertsOverview
  onGuide: (channel: 'TELEGRAM' | 'WHATSAPP') => void
}) => (
  <div className="grid gap-3 sm:grid-cols-3">
    {ALERT_CHANNELS.map((channel) => {
      const state = channelState(channel, overview.channels)
      const active = overview.destinations.filter((d) => d.channel === channel && d.verified && d.enabled).length

      return (
        <div key={channel} className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
            <ChannelIcon channel={channel} className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{ALERT_CHANNEL_LABEL[channel]}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[state.tone])} aria-hidden="true" />
              <span className="truncate" title={state.text}>
                {state.text}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{activeCount(active)}</p>
            {channel !== 'EMAIL' && (
              <button
                type="button"
                onClick={() => onGuide(channel)}
                className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {state.tone === 'ok' ? 'Ver o passo a passo' : 'Como configurar'}
              </button>
            )}
          </div>
        </div>
      )
    })}
  </div>
)
