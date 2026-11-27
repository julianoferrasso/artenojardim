'use client'

import { useEffect, useState } from 'react'
import { Copy, ExternalLink, ShieldAlert, TriangleAlert } from 'lucide-react'
import {
  ERROR_CODES,
  HANDLING_DAYS_MAX,
  meAppSettingsSchema,
  shippingSettingsSchema,
  type MeAppSettingsInput,
  type MeAppSettingsView,
  type MeEnvironment,
  type ShippingSettings,
} from '@ecommerce/shared/contracts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { StrongConfirmDialog, type ConfirmChange } from '@/components/strong-confirm-dialog'
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
      <div role="note" className="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="font-medium">Área sensível: altere só se souber exatamente o que está mudando.</p>
          <p className="mt-1 text-muted-foreground">
            Tudo aqui vale na hora, para a loja inteira. Uma credencial errada ou uma conta trocada pode tirar o
            cálculo de frete do ar — e sem frete nenhum cliente fecha pedido. Toda alteração pede confirmação
            digitada e fica registrada na auditoria.
          </p>
        </div>
      </div>
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

const days = (n: number) => `${n} ${n === 1 ? 'dia útil' : 'dias úteis'}`

function HandlingDaysForm({ settings }: { settings: ShippingSettings }) {
  const save = useUpdateShippingSettings()
  const current = String(settings.handlingDays)
  const [value, setValue] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pendingInput, setPendingInput] = useState<ShippingSettings | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

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
    setConfirmError(null)
    setPendingInput(parsed.data)
  }

  const confirm = () => {
    if (!pendingInput) return
    save.mutate(pendingInput, {
      onSuccess: () => {
        setSaved(true)
        setPendingInput(null)
      },
      onError: (err) =>
        setConfirmError(
          err instanceof ApiError && err.status === 403
            ? 'Só administradores podem mudar o prazo de postagem.'
            : 'Não foi possível salvar. Tente de novo.',
        ),
    })
  }

  return (
    <>
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

      <StrongConfirmDialog
        open={pendingInput !== null}
        onOpenChange={(open) => !open && setPendingInput(null)}
        title="Mudar o prazo de postagem?"
        intro="É a promessa de entrega da loja inteira: confira o número antes de confirmar."
        changes={
          pendingInput
            ? [{ label: 'Postamos em até', from: days(settings.handlingDays), to: days(pendingInput.handlingDays) }]
            : []
        }
        consequences={[
          'Muda na hora toda data de entrega que a loja mostra: página do produto, carrinho e checkout.',
          'Pedidos já feitos mantêm o prazo prometido na compra.',
        ]}
        phrase="ALTERAR"
        confirmLabel="Alterar o prazo"
        pending={save.isPending}
        error={confirmError}
        onConfirm={confirm}
      />
    </>
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

type AppConfirm = { mode: 'change' | 'disconnect'; input: MeAppSettingsInput }

const empty = (v: string | null | undefined) => (v ? v : '(vazio)')

function MelhorEnvioAppForm({ settings }: { settings: MeAppSettingsView }) {
  const save = useUpdateShippingProviderApp()
  const { data: status } = useShippingProviderStatus()
  const [environment, setEnvironment] = useState<MeEnvironment>(settings.environment)
  const [clientId, setClientId] = useState(settings.clientId ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [contactEmail, setContactEmail] = useState(settings.contactEmail ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirm, setConfirm] = useState<AppConfirm | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
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
  // Se divergir, a API recusa com CONFIRMATION_REQUIRED e o diálogo certo abre.
  const dropsConnection =
    settings.clientId !== null && (clientId.trim() !== settings.clientId || environment !== settings.environment)

  /** Valida e abre a confirmação — nada é gravado sem ela. */
  const review = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = meAppSettingsSchema.safeParse({
      environment,
      clientId,
      contactEmail,
      ...(clientSecret.trim() ? { clientSecret } : {}),
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os campos.')
      return
    }
    if (!parsed.data.clientSecret && !settings.clientSecretHint) {
      setError('Informe o Client Secret do aplicativo.')
      return
    }
    setError(null)
    setConfirmError(null)
    setConfirm({ mode: dropsConnection ? 'disconnect' : 'change', input: parsed.data })
  }

  const commit = () => {
    if (!confirm) return
    const input = confirm.mode === 'disconnect' ? { ...confirm.input, confirmDisconnect: true } : confirm.input
    save.mutate(input, {
      onSuccess: () => {
        setClientSecret('')
        setSaved(true)
        setConfirm(null)
      },
      onError: (err) => {
        if (err instanceof ApiError && err.code === ERROR_CODES.CONFIRMATION_REQUIRED) {
          setConfirm({ mode: 'disconnect', input: confirm.input })
          setConfirmError('Esta troca desconecta a conta. Leia o aviso e confirme de novo.')
          return
        }
        setConfirmError(
          err instanceof ApiError && err.status === 403
            ? 'Só administradores podem mudar as credenciais.'
            : err instanceof ApiError && err.status === 422
              ? 'Dados inválidos. Confira os campos e tente de novo.'
              : 'Não foi possível salvar. Tente de novo.',
        )
      },
    })
  }

  const changes: ConfirmChange[] = []
  if (confirm) {
    const next = confirm.input
    if (next.environment !== settings.environment) {
      changes.push({ label: 'Ambiente', from: ENVIRONMENT_LABEL[settings.environment], to: ENVIRONMENT_LABEL[next.environment] })
    }
    if (next.clientId !== (settings.clientId ?? '')) {
      changes.push({ label: 'Client ID', from: empty(settings.clientId), to: next.clientId, mono: true })
    }
    if (next.clientSecret) {
      changes.push({
        label: 'Client Secret',
        from: empty(settings.clientSecretHint),
        to: `••••${next.clientSecret.slice(-4)}`,
        mono: true,
      })
    }
    if (next.contactEmail !== (settings.contactEmail ?? '')) {
      changes.push({ label: 'E-mail', from: empty(settings.contactEmail), to: next.contactEmail })
    }
  }

  const until = status?.expiresAt ? ` (até ${formatDate(status.expiresAt)})` : ''
  const consequences =
    confirm?.mode === 'disconnect'
      ? [
          'O acesso atual é APAGADO na hora: ele pertence ao aplicativo e ao ambiente anteriores.',
          <>
            A loja <strong>para de calcular frete</strong> — nenhum cliente consegue fechar pedido — até você clicar em
            Conectar e autorizar com a conta do Melhor Envio da loja.
          </>,
          ...(confirm.input.environment === 'sandbox'
            ? ['No Sandbox as cotações são de teste: não valem para envios reais.']
            : []),
          'Pedidos já feitos não são afetados.',
        ]
      : [
          'Vale na hora: a próxima renovação automática do acesso já usa estas credenciais.',
          `Se estiverem erradas, a renovação falha e a equipe recebe alerta. O frete segue funcionando com o acesso atual${until} — dá tempo de corrigir aqui, sem reconectar.`,
          ...(confirm?.input.clientSecret
            ? ['Confira que o segredo é o que aparece AGORA no painel do Melhor Envio: gerar um segredo novo lá invalida o antigo.']
            : []),
        ]

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
    <>
      <form noValidate onSubmit={review} className="mt-4 grid gap-4 sm:grid-cols-2">
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

        {dirty && dropsConnection && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:col-span-2"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Trocar o Client ID ou o ambiente desconecta a conta: o frete sai do ar até você conectar de novo.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
            {save.isPending ? 'Salvando…' : 'Revisar e salvar'}
          </Button>
          {saved && <span className="text-sm text-success">Salvo ✓</span>}
          {error && (
            <span role="alert" className="text-sm text-destructive">
              {error}
            </span>
          )}
        </div>
      </form>

      <StrongConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.mode === 'disconnect'
            ? 'Trocar o aplicativo e desconectar o frete?'
            : 'Alterar as credenciais do Melhor Envio?'
        }
        intro={
          confirm?.mode === 'disconnect'
            ? 'Outro Client ID ou outro ambiente é outro aplicativo para o Melhor Envio: a conexão atual não serve para ele.'
            : 'Confira cada valor com o painel do Melhor Envio (Integrações → Área Dev) antes de confirmar.'
        }
        changes={changes}
        consequences={consequences}
        tone={confirm?.mode === 'disconnect' ? 'danger' : 'warning'}
        phrase={confirm?.mode === 'disconnect' ? 'DESCONECTAR' : 'ALTERAR'}
        confirmLabel={confirm?.mode === 'disconnect' ? 'Trocar e desconectar' : 'Salvar credenciais'}
        pending={save.isPending}
        error={confirmError}
        onConfirm={commit}
      />
    </>
  )
}

function MelhorEnvioCard() {
  const { data: status, isLoading, error } = useShippingProviderStatus()
  const connect = useConnectShippingProvider()
  const [confirmingReconnect, setConfirmingReconnect] = useState(false)

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
      : connect.error instanceof ApiError && connect.error.code === ERROR_CODES.SHIPPING_UNAVAILABLE
        ? connect.error.message
        : 'Não foi possível iniciar a conexão. Tente novamente.'

  const badge = !status
    ? null
    : !status.connected
      ? { label: 'Desconectado', variant: 'destructive' as const, className: undefined }
      : status.renewalOverdue
        ? { label: 'Atenção', variant: 'outline' as const, className: 'border-warning/40 bg-warning/15 text-warning-foreground' }
        : { label: 'Conectado', variant: 'outline' as const, className: 'border-success/30 bg-success/15 text-success' }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold">Melhor Envio</h2>
        {badge && (
          <Badge variant={badge.variant} className={badge.className}>
            {badge.label}
          </Badge>
        )}
      </div>

      {isLoading && <Skeleton className="mt-3 h-10 w-full" />}
      {/* Refetch que falha mantém o status anterior: o erro só vale quando não há nada a mostrar. */}
      {error && !status && <p className="mt-3 text-sm text-destructive">Falha ao carregar o status do frete.</p>}

      {status && (
        <p className="mt-3 text-sm text-muted-foreground">
          {status.connected
            ? `A loja está calculando fretes. O acesso se renova sozinho${
                status.expiresAt ? ` (vencimento atual: ${formatDate(status.expiresAt)})` : ''
              }.`
            : 'A loja NÃO está calculando fretes: o cliente não consegue fechar o pedido. Conecte a conta do Melhor Envio da loja (a que tem o saldo).'}
        </p>
      )}

      {status?.renewalOverdue && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p>
            A renovação automática do acesso está falhando há mais de um dia. O frete funciona até{' '}
            <strong>{status.expiresAt ? formatDate(status.expiresAt) : 'o vencimento'}</strong>; depois disso, para.
            Confira o Client ID e o Client Secret no card acima: corrigir lá basta, não precisa reconectar.
          </p>
        </div>
      )}

      {status && (
        <div className="mt-4 flex flex-col gap-2">
          <Button
            className="w-fit"
            variant={status.connected ? 'outline' : 'default'}
            onClick={() => (status.connected ? setConfirmingReconnect(true) : startConnection())}
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

      <StrongConfirmDialog
        open={confirmingReconnect}
        onOpenChange={setConfirmingReconnect}
        title="Reconectar a conta do Melhor Envio?"
        intro="A conta está conectada e funcionando. Reconecte só se o suporte pedir ou se for trocar a conta que paga os fretes."
        consequences={[
          'Abre o Melhor Envio numa nova aba para autorizar de novo.',
          <>
            Entre com a <strong>conta da loja</strong> (a que tem o saldo). Autorizando outra conta, os fretes passam a
            ser calculados — e, com as etiquetas, cobrados — nela.
          </>,
          'O acesso atual continua valendo até a nova autorização ser concluída. Se desistir no meio, nada muda.',
        ]}
        phrase="RECONECTAR"
        confirmLabel="Abrir o Melhor Envio"
        onConfirm={() => {
          setConfirmingReconnect(false)
          startConnection()
        }}
      />
    </section>
  )
}
