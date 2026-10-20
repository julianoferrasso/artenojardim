'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import { CircleCheck, Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import {
  ALERT_CHANNELS,
  ALERT_CHANNEL_LABEL,
  ALERT_EVENT_CATALOG,
  ALERT_EVENT_GROUPS,
  ALERT_EVENT_GROUP_LABEL,
  ALERT_EVENT_TYPES,
  type AlertChannel,
  type AlertEventType,
} from '@ecommerce/shared/constants'
import {
  ALERT_CODE_LENGTH,
  ERROR_CODES,
  createAlertDestinationSchema,
  type AlertDestination,
  type AlertDestinationStep,
  type AlertsOverview,
  type CreateAlertDestinationInput,
} from '@ecommerce/shared/contracts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ApiError } from '@/lib/api'
import {
  alertErrorMessage,
  destinationAddress,
  syncTelegramLink,
  useCreateAlertDestination,
  useResendAlertCode,
  useUpdateAlertDestination,
  useVerifyAlertCode,
} from '@/lib/alerts'
import { cn } from '@/lib/utils'
import { ChannelIcon } from './channel-icon'

type Step = 'channel' | 'details' | 'telegram' | 'code' | 'events'
type TelegramLinks = NonNullable<AlertDestinationStep['telegramLinks']>
type GuideChannel = 'TELEGRAM' | 'WHATSAPP'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  channels: AlertsOverview['channels'] | undefined
  /** Destino pendente a retomar ("Continuar verificação"). Null = cadastro novo. */
  resume: AlertDestination | null
  onGuide: (channel: GuideChannel) => void
}

const TITLE: Record<Step, string> = {
  channel: 'Novo destino de alertas',
  details: 'Novo destino de alertas',
  telegram: 'Vincular o Telegram',
  code: 'Digite o código',
  events: 'O que este destino recebe?',
}

/**
 * Cadastro em passos: canal → dados → (link do Telegram) → código → eventos. O
 * conteúdo remonta a cada abertura (key), então nada de um cadastro anterior
 * vaza para o próximo.
 */
export const AddDestinationDialog = ({ open, onOpenChange, channels, resume, onGuide }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-lg">
      {open && (
        <Wizard
          key={resume?.id ?? 'new'}
          channels={channels}
          resume={resume}
          onGuide={onGuide}
          onDone={() => onOpenChange(false)}
        />
      )}
    </DialogContent>
  </Dialog>
)

const firstStep = (resume: AlertDestination | null): Step => {
  if (!resume) return 'channel'
  return resume.pendingStep === 'telegram_link' ? 'telegram' : 'code'
}

const Wizard = ({
  channels,
  resume,
  onGuide,
  onDone,
}: {
  channels: AlertsOverview['channels'] | undefined
  resume: AlertDestination | null
  onGuide: (channel: GuideChannel) => void
  onDone: () => void
}) => {
  const [step, setStep] = useState<Step>(firstStep(resume))
  const [channel, setChannel] = useState<AlertChannel>(resume?.channel ?? 'EMAIL')
  const [destination, setDestination] = useState<AlertDestination | null>(resume)
  const [links, setLinks] = useState<TelegramLinks | null>(null)

  const afterCreate = (result: AlertDestinationStep) => {
    setDestination(result.destination)
    if (result.telegramLinks) {
      setLinks(result.telegramLinks)
      setStep('telegram')
    } else {
      setStep(result.destination.verified ? 'events' : 'code')
    }
  }

  const description =
    step === 'channel'
      ? 'Escolha por onde receber. Todo destino é confirmado por um código antes de receber alertas.'
      : step === 'details'
        ? `${ALERT_CHANNEL_LABEL[channel]}: dê um nome e informe para onde enviar.`
        : undefined

  return (
    <>
      <DialogHeader>
        <DialogTitle>{TITLE[step]}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>

      {step === 'channel' && (
        <ChannelStep
          channels={channels}
          onPick={(picked) => {
            setChannel(picked)
            setStep('details')
          }}
          onGuide={onGuide}
        />
      )}
      {step === 'details' && (
        <DetailsStep channel={channel} onBack={() => setStep('channel')} onCreated={afterCreate} />
      )}
      {step === 'telegram' && destination && (
        <TelegramStep
          destination={destination}
          links={links}
          onLinks={setLinks}
          onLinked={(next) => {
            setDestination(next)
            setStep(next.verified ? 'events' : 'code')
          }}
        />
      )}
      {step === 'code' && destination && (
        <CodeStep
          destination={destination}
          onDestination={setDestination}
          onVerified={(next) => {
            setDestination(next)
            setStep('events')
          }}
        />
      )}
      {step === 'events' && destination && <EventsStep destination={destination} onDone={onDone} />}
    </>
  )
}

// ── Canal ────────────────────────────────────────────────────────────────────

const CHANNEL_HINT: Record<AlertChannel, string> = {
  EMAIL: 'Um código chega no e-mail; você digita aqui.',
  TELEGRAM: 'Você toca em Iniciar no bot, e o código chega no chat ou no grupo.',
  WHATSAPP: 'O código chega por mensagem no WhatsApp.',
}

const isAvailable = (channel: AlertChannel, channels: AlertsOverview['channels'] | undefined): boolean => {
  if (!channels) return false
  if (channel === 'TELEGRAM') return channels.TELEGRAM.available && channels.TELEGRAM.botUsername !== null
  return channels[channel].available
}

const ChannelStep = ({
  channels,
  onPick,
  onGuide,
}: {
  channels: AlertsOverview['channels'] | undefined
  onPick: (channel: AlertChannel) => void
  onGuide: (channel: GuideChannel) => void
}) => (
  <div className="grid gap-2">
    {ALERT_CHANNELS.map((channel) => {
      const available = isAvailable(channel, channels)
      const icon = (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
          <ChannelIcon channel={channel} className="size-4" />
        </span>
      )

      if (!available) {
        return (
          <div key={channel} className="flex items-center gap-3 rounded-lg border border-dashed border-border p-3">
            {icon}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-muted-foreground">{ALERT_CHANNEL_LABEL[channel]}</p>
              <p className="text-xs text-muted-foreground">Ainda não configurado no servidor.</p>
            </div>
            {channel !== 'EMAIL' && (
              <Button size="sm" variant="ghost" onClick={() => onGuide(channel)}>
                Como configurar
              </Button>
            )}
          </div>
        )
      }

      return (
        <button
          key={channel}
          type="button"
          onClick={() => onPick(channel)}
          className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {icon}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{ALERT_CHANNEL_LABEL[channel]}</span>
            <span className="block text-xs text-muted-foreground">{CHANNEL_HINT[channel]}</span>
          </span>
        </button>
      )
    })}
  </div>
)

// ── Dados ────────────────────────────────────────────────────────────────────

const LABEL_PLACEHOLDER: Record<AlertChannel, string> = {
  EMAIL: 'Ex.: E-mail do Juliano',
  TELEGRAM: 'Ex.: Grupo da equipe',
  WHATSAPP: 'Ex.: Celular da loja',
}

const DetailsStep = ({
  channel,
  onBack,
  onCreated,
}: {
  channel: AlertChannel
  onBack: () => void
  onCreated: (result: AlertDestinationStep) => void
}) => {
  const create = useCreateAlertDestination()
  const [label, setLabel] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const input: CreateAlertDestinationInput =
      channel === 'EMAIL'
        ? { channel, label, email: address }
        : channel === 'WHATSAPP'
          ? { channel, label, phone: address }
          : { channel, label }

    const parsed = createAlertDestinationSchema.safeParse(input)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os dados.')
      return
    }
    setError(null)
    create.mutate(input, { onSuccess: onCreated, onError: (err) => setError(alertErrorMessage(err)) })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="alert-label">Nome</Label>
        <Input
          id="alert-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={LABEL_PLACEHOLDER[channel]}
          maxLength={60}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">Só para reconhecer este destino na lista.</p>
      </div>

      {channel === 'EMAIL' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alert-email">E-mail</Label>
          <Input
            id="alert-email"
            type="email"
            autoComplete="email"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="voce@exemplo.com"
          />
        </div>
      )}

      {channel === 'WHATSAPP' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alert-phone">Número do WhatsApp</Label>
          <Input
            id="alert-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="(54) 99999-9999"
          />
          <p className="text-xs text-muted-foreground">Com DDD. De outro país: comece com + e o código do país.</p>
        </div>
      )}

      {channel === 'TELEGRAM' && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          No próximo passo você abre um link no Telegram e toca em <strong>Iniciar</strong>, na conversa com o bot ou
          num grupo. O código de confirmação chega lá.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onBack}>
          Voltar
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Enviando…' : channel === 'TELEGRAM' ? 'Gerar link' : 'Enviar código'}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ── Telegram ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Uma espera dura até 10 s na API. Entre uma volta rápida (erro, outra espera do
 * mesmo bot) e a próxima, ao menos 3 s: o limite geral da API é por IP, e o resto
 * do painel divide a mesma cota.
 */
const MIN_ROUND_MS = 3_000
/** Depois disso a tela para de perguntar e oferece "continuar esperando". */
const MAX_WAIT_MS = 10 * 60_000

const TelegramStep = ({
  destination,
  links,
  onLinks,
  onLinked,
}: {
  destination: AlertDestination
  links: TelegramLinks | null
  onLinks: (links: TelegramLinks) => void
  onLinked: (destination: AlertDestination) => void
}) => {
  const resend = useResendAlertCode()
  const [target, setTarget] = useState<'private' | 'group'>('private')
  const [state, setState] = useState<'waiting' | 'expired' | 'idle'>('waiting')
  const [problem, setProblem] = useState<string | null>(destination.lastError)
  const [copied, setCopied] = useState(false)
  const [round, setRound] = useState(0)
  const requested = useRef(false)

  // O pai recria os callbacks a cada render; o laço de espera não pode reiniciar por isso.
  const callbacks = useRef({ onLinks, onLinked, resendLink: resend.mutate })
  useEffect(() => {
    callbacks.current = { onLinks, onLinked, resendLink: resend.mutate }
  })

  // Retomada: o link original não pode ser remontado (o banco guarda o hash). Gera outro, uma vez.
  useEffect(() => {
    if (links || requested.current) return
    requested.current = true
    callbacks.current.resendLink(destination.id, {
      onSuccess: (result) =>
        result.telegramLinks
          ? callbacks.current.onLinks(result.telegramLinks)
          : callbacks.current.onLinked(result.destination),
      onError: (err) => setProblem(alertErrorMessage(err)),
    })
  }, [links, destination.id])

  // A espera: uma chamada por vez, nunca em intervalo — duas esperas abertas se atropelariam.
  useEffect(() => {
    if (!links || state !== 'waiting') return
    let cancelled = false
    const startedAt = Date.now()

    const wait = async () => {
      while (!cancelled && Date.now() - startedAt < MAX_WAIT_MS) {
        const roundStart = Date.now()
        try {
          const status = await syncTelegramLink(destination.id)
          if (cancelled) return
          if (status.state === 'code_sent' || status.state === 'verified') {
            return callbacks.current.onLinked(status.destination)
          }
          if (status.state === 'expired') return setState('expired')
          setProblem(status.destination.lastError)
        } catch (err) {
          if (cancelled) return
          setProblem(alertErrorMessage(err))
          // Canal fora do servidor ou destino excluído: repetir não muda nada.
          if (err instanceof ApiError && (err.code === ERROR_CODES.ALERT_CHANNEL_UNAVAILABLE || err.status === 404)) {
            return setState('idle')
          }
        }
        const elapsed = Date.now() - roundStart
        if (elapsed < MIN_ROUND_MS) await sleep(MIN_ROUND_MS - elapsed)
      }
      if (!cancelled) setState('idle')
    }

    void wait()
    return () => {
      cancelled = true
    }
  }, [links, state, round, destination.id])

  const newLink = () =>
    resend.mutate(destination.id, {
      onSuccess: (result) => {
        if (!result.telegramLinks) return onLinked(result.destination)
        onLinks(result.telegramLinks)
        setProblem(null)
        setState('waiting')
        setRound((r) => r + 1)
      },
      onError: (err) => setProblem(alertErrorMessage(err)),
    })

  const link = links?.[target] ?? null

  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Onde receber os alertas" className="grid grid-cols-2 gap-2">
        {(['private', 'group'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={target === option}
            onClick={() => setTarget(option)}
            className={cn(
              'rounded-md border px-3 py-2 text-sm transition-colors',
              target === option ? 'border-primary bg-accent font-medium' : 'border-border hover:border-primary/50',
            )}
          >
            {option === 'private' ? 'Conversa com o bot' : 'Um grupo'}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="shrink-0 rounded-lg border border-border bg-background p-3 text-foreground">
          {link ? (
            <QRCodeSVG value={link} size={144} bgColor="transparent" fgColor="currentColor" title="QR code do link" />
          ) : (
            <Skeleton className="size-36" />
          )}
        </div>
        <div className="space-y-3 text-sm">
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>
              {target === 'private'
                ? 'Aponte a câmera do celular para o código, ou abra o link.'
                : 'Abra o link: o Telegram pede para escolher o grupo e adiciona o bot a ele.'}
            </li>
            <li>
              Toque em <strong>Iniciar</strong>
              {target === 'group' ? ' (no grupo, o comando sai sozinho ao adicionar o bot).' : '.'}
            </li>
            <li>O bot manda o código no Telegram, e esta tela avança sozinha.</li>
          </ol>
          {link && (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a href={link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  Abrir no Telegram
                </a>
              </Button>
              <Button size="sm" variant="outline" onClick={copy}>
                <Copy />
                {copied ? 'Copiado' : 'Copiar link'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {state === 'waiting' && links && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Aguardando você tocar em Iniciar…
        </p>
      )}

      {problem && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {problem}
        </p>
      )}

      {state !== 'waiting' && (
        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          <p className="text-muted-foreground">
            {state === 'expired'
              ? 'O link expirou (vale 30 minutos). Gere outro para continuar.'
              : 'Parei de esperar. Já tocou em Iniciar? Gere um link novo para tentar de novo.'}
          </p>
          <Button className="mt-2" size="sm" variant="outline" onClick={newLink} disabled={resend.isPending}>
            <RefreshCw />
            Gerar novo link
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Código ───────────────────────────────────────────────────────────────────

const useNow = (everyMs: number): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}

const CodeStep = ({
  destination,
  onDestination,
  onVerified,
}: {
  destination: AlertDestination
  onDestination: (destination: AlertDestination) => void
  onVerified: (destination: AlertDestination) => void
}) => {
  const verify = useVerifyAlertCode()
  const resend = useResendAlertCode()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [resent, setResent] = useState(false)
  const now = useNow(1000)

  const resendAt = destination.resendAvailableAt ? Date.parse(destination.resendAvailableAt) : 0
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000))

  const submit = (value: string) => {
    if (value.length !== ALERT_CODE_LENGTH || verify.isPending) return
    verify.mutate(
      { id: destination.id, code: value },
      {
        onSuccess: onVerified,
        onError: (err) => {
          setCode('')
          setError(alertErrorMessage(err))
          if (err instanceof ApiError && err.code === ERROR_CODES.ALERT_CODE_EXPIRED) setExpired(true)
        },
      },
    )
  }

  const askAgain = () =>
    resend.mutate(destination.id, {
      onSuccess: (result) => {
        onDestination(result.destination)
        setCode('')
        setError(null)
        setExpired(false)
        setResent(true)
      },
      onError: (err) => setError(alertErrorMessage(err)),
    })

  const where =
    destination.channel === 'TELEGRAM'
      ? `no Telegram (${destinationAddress(destination)})`
      : destination.channel === 'WHATSAPP'
        ? `por WhatsApp para ${destinationAddress(destination)}`
        : `para ${destinationAddress(destination)}`

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {resent ? 'Mandamos um código novo' : 'Mandamos um código de 6 dígitos'} {where}. Ele vale por 10 minutos.
        {destination.channel === 'EMAIL' && ' Se não chegar, confira o spam.'}
      </p>

      <div className="flex justify-center py-1">
        <InputOTP
          maxLength={ALERT_CODE_LENGTH}
          value={code}
          onChange={(value) => {
            setCode(value)
            setError(null)
          }}
          onComplete={submit}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          disabled={verify.isPending || expired}
          aria-label="Código de verificação"
        >
          <InputOTPGroup>
            {Array.from({ length: ALERT_CODE_LENGTH }, (_, index) => (
              <InputOTPSlot key={index} index={index} aria-invalid={!!error} className="size-11 text-lg" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-1 text-sm">
        <span className="text-muted-foreground">Não chegou?</span>
        <Button variant="link" size="sm" onClick={askAgain} disabled={wait > 0 || resend.isPending}>
          {resend.isPending ? 'Enviando…' : wait > 0 ? `Reenviar em ${wait} s` : 'Reenviar código'}
        </Button>
      </div>

      <DialogFooter>
        <Button onClick={() => submit(code)} disabled={code.length !== ALERT_CODE_LENGTH || verify.isPending}>
          {verify.isPending ? 'Conferindo…' : 'Confirmar'}
        </Button>
      </DialogFooter>
    </div>
  )
}

// ── Eventos ──────────────────────────────────────────────────────────────────

const EventsStep = ({ destination, onDone }: { destination: AlertDestination; onDone: () => void }) => {
  const update = useUpdateAlertDestination()
  const [events, setEvents] = useState<AlertEventType[]>(destination.events)

  const toggle = (type: AlertEventType, on: boolean) =>
    setEvents((current) => (on ? [...current, type] : current.filter((e) => e !== type)))

  const finish = () => {
    const unchanged =
      events.length === destination.events.length && events.every((e) => destination.events.includes(e))
    if (unchanged) return onDone()
    update.mutate({ id: destination.id, input: { events } }, { onSuccess: onDone })
  }

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-md bg-success/15 px-3 py-2 text-sm text-success">
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          “{destination.label}” confirmado. Escolha o que ele recebe — dá para mudar depois na aba Eventos.
        </span>
      </p>

      <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
        {ALERT_EVENT_GROUPS.map((group) => (
          <fieldset key={group}>
            <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {ALERT_EVENT_GROUP_LABEL[group]}
            </legend>
            {ALERT_EVENT_TYPES.filter((type) => ALERT_EVENT_CATALOG[type].group === group).map((type) => (
              <label key={type} className="flex items-start justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block text-sm">{ALERT_EVENT_CATALOG[type].label}</span>
                  <span className="block text-xs text-muted-foreground">{ALERT_EVENT_CATALOG[type].description}</span>
                </span>
                <Switch checked={events.includes(type)} onCheckedChange={(on: boolean) => toggle(type, on)} className="mt-0.5" />
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      {update.isError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {alertErrorMessage(update.error, 'Não foi possível salvar os eventos.')}
        </p>
      )}

      <DialogFooter>
        <Button onClick={finish} disabled={update.isPending}>
          {update.isPending ? 'Salvando…' : 'Concluir'}
        </Button>
      </DialogFooter>
    </div>
  )
}
