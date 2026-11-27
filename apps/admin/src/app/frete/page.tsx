'use client'

import { useEffect, useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import {
  HANDLING_DAYS_MAX,
  meAppSettingsSchema,
  shippingSettingsSchema,
  type MeAppSettingsView,
  type MeEnvironment,
  type ShippingSettings,
} from '@ecommerce/shared/contracts'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import {
  useConnectShippingProvider,
  useShippingProviderApp,
  useShippingProviderStatus,
  useUpdateShippingProviderApp,
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
        <MelhorEnvioAppCard />
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

const ENVIRONMENT_LABEL: Record<MeEnvironment, string> = {
  production: 'Produção',
  sandbox: 'Sandbox (teste)',
}

/**
 * Credenciais do aplicativo cadastrado no painel do Melhor Envio (Integrações →
 * Área Dev). Antes viviam no .env da API, e trocar o segredo exigia SSH. Só
 * ADMIN vê: a API recusa a leitura para os outros cargos.
 */
function MelhorEnvioAppCard() {
  const { data, isLoading, error } = useShippingProviderApp()

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Aplicativo do Melhor Envio</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        As credenciais do aplicativo criado no painel do Melhor Envio, em Integrações → Área Dev. Sem elas a loja
        não renova o acesso e o frete para de funcionar.
      </p>
      {isLoading && <Skeleton className="mt-4 h-40 w-full" />}
      {error && (
        <p className="mt-3 text-sm text-destructive">
          {error instanceof ApiError && error.status === 403
            ? 'Só administradores veem as credenciais do aplicativo.'
            : 'Falha ao carregar as credenciais.'}
        </p>
      )}
      {data && <MelhorEnvioAppForm settings={data} />}
    </section>
  )
}

function MelhorEnvioAppForm({ settings }: { settings: MeAppSettingsView }) {
  const save = useUpdateShippingProviderApp()
  const [environment, setEnvironment] = useState<MeEnvironment>(settings.environment)
  const [clientId, setClientId] = useState(settings.clientId ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [contactEmail, setContactEmail] = useState(settings.contactEmail ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [saved])

  const dirty =
    environment !== settings.environment ||
    clientId.trim() !== (settings.clientId ?? '') ||
    clientSecret.trim() !== '' ||
    contactEmail.trim() !== (settings.contactEmail ?? '')
  // A mesma regra da API: outro app ou outro ambiente invalida os tokens atuais.
  const dropsConnection =
    settings.clientId !== null && (clientId.trim() !== settings.clientId || environment !== settings.environment)

  const submit = () => {
    const parsed = meAppSettingsSchema.safeParse({
      environment,
      clientId,
      contactEmail,
      ...(clientSecret.trim() ? { clientSecret } : {}),
    })
    if (!parsed.success) {
      setConfirming(false)
      setError(parsed.error.issues[0]?.message ?? 'Confira os campos.')
      return
    }
    if (!parsed.data.clientSecret && !settings.clientSecretHint) {
      setConfirming(false)
      setError('Informe o Client Secret do aplicativo.')
      return
    }
    setError(null)
    save.mutate(parsed.data, {
      onSuccess: () => {
        setClientSecret('')
        setSaved(true)
        setConfirming(false)
      },
      onError: (err) => {
        setConfirming(false)
        setError(
          err instanceof ApiError && err.status === 403
            ? 'Só administradores podem mudar as credenciais.'
            : 'Não foi possível salvar. Confira os campos e tente de novo.',
        )
      },
    })
  }

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(settings.redirectUri)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Sem permissão de área de transferência: o texto continua selecionável.
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (dropsConnection) setConfirming(true)
        else submit()
      }}
      className="mt-4 grid gap-4 sm:grid-cols-2"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="me-env">Ambiente</Label>
        <Select value={environment} onValueChange={(v: string) => setEnvironment(v as MeEnvironment)}>
          <SelectTrigger id="me-env" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ENVIRONMENT_LABEL) as MeEnvironment[]).map((env) => (
              <SelectItem key={env} value={env}>
                {ENVIRONMENT_LABEL[env]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="me-client-id">Client ID</Label>
        <Input
          id="me-client-id"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="me-client-secret">Client Secret</Label>
        <Input
          id="me-client-secret"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={settings.clientSecretHint ? `Atual: ${settings.clientSecretHint}` : 'Cole o segredo do aplicativo'}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">
          {settings.clientSecretHint ? 'Deixe em branco para manter o atual.' : 'Ainda não configurado.'}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="me-email">E-mail de contato</Label>
        <Input
          id="me-email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="contato@sualoja.com.br"
        />
        <p className="text-xs text-muted-foreground">O Melhor Envio exige um e-mail técnico em toda chamada.</p>
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="me-redirect">URL de redirecionamento</Label>
        <div className="flex gap-2">
          <Input id="me-redirect" value={settings.redirectUri} readOnly className="font-mono text-xs" />
          <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => void copyRedirect()}>
            <Copy />
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Tem que estar cadastrada, exatamente assim, no aplicativo do painel do Melhor Envio.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar credenciais'}
        </Button>
        {saved && <span className="text-sm text-success">Salvo ✓</span>}
        {error && (
          <span role="alert" className="text-sm text-destructive">
            {error}
          </span>
        )}
      </div>

      <AlertDialog open={confirming} onOpenChange={(open: boolean) => !open && setConfirming(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar o aplicativo do Melhor Envio?</AlertDialogTitle>
            <AlertDialogDescription>
              O acesso atual pertence ao aplicativo anterior e será descartado: a loja para de calcular frete até
              você clicar em Conectar e autorizar de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={save.isPending}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault()
                submit()
              }}
            >
              Trocar e desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
