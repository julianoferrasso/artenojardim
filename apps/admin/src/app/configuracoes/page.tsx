'use client'

import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { updateStaffNotificationsSchema } from '@ecommerce/shared/contracts'
import { ROLE_RANK, type UserRole } from '@ecommerce/shared/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useStaffNotifications,
  useTestStaffNotifications,
  useUpdateStaffNotifications,
} from '@/lib/store-notifications'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'

/** Mesmo piso da rota na API (requireMinRole). */
const MIN_ROLE: UserRole = 'ADMIN'

export default function SettingsPage() {
  const { user } = useAuth()
  const allowed = !!user && ROLE_RANK[user.role] >= ROLE_RANK[MIN_ROLE]

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Configurações</h1>
      <p className="mb-6 text-sm text-muted-foreground">Ajustes de funcionamento da loja.</p>

      {allowed ? (
        <StaffNotificationsCard />
      ) : (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Só administradores acessam as configurações da loja. Fale com um administrador se
          precisar mudar algo aqui.
        </div>
      )}
    </div>
  )
}

function StaffNotificationsCard() {
  const { data, isLoading, error } = useStaffNotifications(true)
  const update = useUpdateStaffNotifications()
  const test = useTestStaffNotifications()

  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // O servidor é a verdade: outra aba (ou outro admin) pode ter alterado.
  useEffect(() => setEmail(data?.staffEmail ?? ''), [data?.staffEmail])

  const dirty = email.trim().toLowerCase() !== (data?.staffEmail ?? '')

  const save = async () => {
    setFormError(null)
    const parsed = updateStaffNotificationsSchema.safeParse({ staffEmail: email })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'E-mail inválido.')
      return
    }
    try {
      await update.mutateAsync({ staffEmail: email })
      test.reset()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Não foi possível salvar.')
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">Notificações da equipe</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Para onde vão os avisos que pedem ação da loja: mensagens novas de clientes no atendimento,
        pedidos cancelados, pedidos de cancelamento esperando decisão e estornos que o provedor
        recusou.
      </p>

      {isLoading && <Skeleton className="mt-4 h-24 w-full" />}
      {error && (
        <p className="mt-4 text-sm text-destructive">
          {error instanceof ApiError ? error.message : 'Falha ao carregar as notificações.'}
        </p>
      )}

      {data && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-email">E-mail da equipe</Label>
            <Input
              id="staff-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setFormError(null)
              }}
              placeholder={data.defaultEmail}
              maxLength={254}
            />
            <p className="text-xs text-muted-foreground">
              Deixe em branco para usar o e-mail da loja ({data.defaultEmail}).
            </p>
            {formError && <p className="text-xs text-destructive">{formError}</p>}
          </div>

          <p className="text-sm">
            Enviando para: <strong className="break-all">{data.effectiveEmail}</strong>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!dirty || update.isPending} onClick={() => void save()}>
              {update.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button
              variant="outline"
              disabled={dirty || test.isPending}
              onClick={() => test.mutate()}
            >
              <Send className="size-4" />
              {test.isPending ? 'Enviando…' : 'Enviar e-mail de teste'}
            </Button>
            {saved && <span className="text-xs text-success">Salvo ✓</span>}
          </div>

          {/* O teste vai para o endereço SALVO: com o campo alterado, testaria o antigo. */}
          {dirty && (
            <p className="text-xs text-muted-foreground">Salve antes de enviar o teste.</p>
          )}
          {test.isSuccess && (
            <p className="text-sm text-success">Enviado para {test.data.to}. Confira a caixa de entrada.</p>
          )}
          {test.isError && (
            <p className="text-sm text-destructive">
              {test.error instanceof ApiError
                ? test.error.message
                : 'Não foi possível enviar o e-mail de teste.'}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
