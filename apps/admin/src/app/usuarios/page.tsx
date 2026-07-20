'use client'

import { useState } from 'react'
import {
  canManageUser,
  DENIAL_MESSAGE,
  passwordSchema,
  type StaffUser,
  type StaffUserStatus,
  type Actor,
  type StaffAction,
} from '@ecommerce/shared/contracts'
import { USER_ROLES, type UserRole } from '@ecommerce/shared/constants'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StaffUserForm } from '@/components/staff-user-form'
import {
  useStaffUsers,
  useDeactivateStaffUser,
  useReactivateStaffUser,
  useResetStaffPassword,
  ROLE_LABEL,
} from '@/lib/users'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/utils'

/** Sentinela do Select: Radix não aceita SelectItem com value="". */
const ALL = 'all'

type Editing = { mode: 'create' } | { mode: 'edit'; user: StaffUser } | null

export default function UsersPage() {
  const { user, logout } = useAuth()

  const [q, setQ] = useState('')
  const [role, setRole] = useState<string>(ALL)
  const [status, setStatus] = useState<StaffUserStatus>('active')
  const [page, setPage] = useState(1)

  const [editing, setEditing] = useState<Editing>(null)
  const [deactivating, setDeactivating] = useState<StaffUser | null>(null)
  const [resetting, setResetting] = useState<StaffUser | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, error } = useStaffUsers({
    q: q || undefined,
    role: role === ALL ? undefined : (role as UserRole),
    status,
    page,
  })

  const deactivate = useDeactivateStaffUser()
  const reactivate = useReactivateStaffUser()

  const resetPage = () => setPage(1)
  const actor: Actor | null = user ? { id: user.id, role: user.role } : null

  /**
   * A MESMA função que a API impõe decide se o botão fica ativo. Sem isso, as
   * duas regras divergem no primeiro ajuste — e o usuário só descobre a negativa
   * depois de clicar.
   *
   * A exceção conhecida: o front não sabe contar proprietários ativos, então o
   * "último OWNER" só é barrado pela API, com 409, e aparece em `actionError`.
   */
  const decide = (target: StaffUser, action: StaffAction) =>
    actor
      ? canManageUser(actor, target, action)
      : ({ allowed: false, reason: 'NOT_A_MANAGER' } as const)

  const onError = (e: unknown) =>
    setActionError(e instanceof ApiError ? e.message : 'Não foi possível concluir a ação.')

  const hasFilters = q !== '' || role !== ALL || status !== 'active'
  const clear = () => {
    setQ('')
    setRole(ALL)
    setStatus('active')
    resetPage()
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Usuários</h1>
        <Button onClick={() => setEditing({ mode: 'create' })}>Novo usuário</Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="busca">Buscar</Label>
          <Input
            id="busca"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              resetPage()
            }}
            placeholder="Nome ou e-mail"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cargo">Cargo</Label>
          <Select
            value={role}
            onValueChange={(v: string) => {
              setRole(v)
              resetPage()
            }}
          >
            <SelectTrigger id="cargo" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos</SelectItem>
              {USER_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="situacao">Situação</Label>
          <Select
            value={status}
            onValueChange={(v: string) => {
              setStatus(v as StaffUserStatus)
              resetPage()
            }}
          >
            <SelectTrigger id="situacao" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
          <Button variant="ghost" onClick={clear}>
            Limpar
          </Button>
        )}
      </div>

      {actionError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {error && (
            <p className="text-sm text-destructive">Não foi possível carregar os usuários.</p>
          )}

          {isLoading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          )}

          {data && data.data.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {hasFilters ? 'Nenhum usuário com esses filtros.' : 'Nenhum usuário cadastrado.'}
            </div>
          )}

          {data && data.data.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Último acesso</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((row) => {
                    const isSelf = row.id === user?.id
                    const updateDecision = decide(row, 'update')
                    const toggleAction = row.isActive ? 'deactivate' : 'reactivate'
                    const toggleDecision = decide(row, toggleAction)
                    const passwordDecision = decide(row, 'resetPassword')

                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <span className="block truncate font-medium">
                            {row.name}
                            {isSelf && (
                              <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.email}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.role === 'STAFF' ? 'secondary' : 'default'}>
                            {ROLE_LABEL[row.role]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.isActive ? (
                            <span className="text-sm">Ativo</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Inativo</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {row.lastLoginAt ? formatDate(row.lastLoginAt) : 'Nunca acessou'}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!updateDecision.allowed}
                            title={
                              updateDecision.allowed
                                ? undefined
                                : DENIAL_MESSAGE[updateDecision.reason]
                            }
                            onClick={() => {
                              setActionError(null)
                              setEditing({ mode: 'edit', user: row })
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!passwordDecision.allowed}
                            title={
                              passwordDecision.allowed
                                ? undefined
                                : DENIAL_MESSAGE[passwordDecision.reason]
                            }
                            onClick={() => {
                              setActionError(null)
                              setResetting(row)
                            }}
                          >
                            Senha
                          </Button>
                          {row.isActive ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              disabled={!toggleDecision.allowed}
                              title={
                                toggleDecision.allowed
                                  ? undefined
                                  : DENIAL_MESSAGE[toggleDecision.reason]
                              }
                              onClick={() => {
                                setActionError(null)
                                setDeactivating(row)
                              }}
                            >
                              Desativar
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!toggleDecision.allowed || reactivate.isPending}
                              title={
                                toggleDecision.allowed
                                  ? undefined
                                  : DENIAL_MESSAGE[toggleDecision.reason]
                              }
                              onClick={() => {
                                setActionError(null)
                                reactivate.mutate(row.id, { onError })
                              }}
                            >
                              Reativar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {data && data.meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.meta.page <= 1}
              >
                ← Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                {data.meta.total} usuários · página {data.meta.page} de {data.meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
                disabled={data.meta.page >= data.meta.totalPages}
              >
                Próxima →
              </Button>
            </div>
          )}
        </div>

        {editing && (
          <aside className="w-full lg:w-96 lg:shrink-0">
            {/* key força remount ao trocar de registro: sem ela o RHF mantém os
                defaultValues do usuário anterior. */}
            <StaffUserForm
              key={editing.mode === 'edit' ? editing.user.id : 'new'}
              {...(editing.mode === 'edit' ? { initial: editing.user } : {})}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          </aside>
        )}
      </div>

      <DeactivateDialog
        target={deactivating}
        pending={deactivate.isPending}
        onClose={() => setDeactivating(null)}
        onConfirm={(id) =>
          deactivate.mutate(id, {
            onSuccess: () => setDeactivating(null),
            onError: (e) => {
              onError(e)
              setDeactivating(null)
            },
          })
        }
      />

      <ResetPasswordDialog
        target={resetting}
        isSelf={resetting?.id === user?.id}
        onClose={() => setResetting(null)}
        onSelfReset={() => void logout()}
      />
    </div>
  )
}

const DeactivateDialog = ({
  target,
  pending,
  onClose,
  onConfirm,
}: {
  target: StaffUser | null
  pending: boolean
  onClose: () => void
  onConfirm: (id: string) => void
}) => (
  <AlertDialog open={target !== null} onOpenChange={(open: boolean) => !open && onClose()}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Desativar {target?.name}?</AlertDialogTitle>
        <AlertDialogDescription>
          A pessoa perde o acesso imediatamente e as sessões abertas são encerradas. O histórico
          de ações dela é preservado, e você pode reativar a conta depois.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancelar</AlertDialogCancel>
        <AlertDialogAction
          disabled={pending}
          onClick={(e: React.MouseEvent) => {
            // O Radix fecha o diálogo por padrão; sem o preventDefault o erro do
            // servidor sumiria junto com ele.
            e.preventDefault()
            if (target) onConfirm(target.id)
          }}
        >
          {pending ? 'Desativando…' : 'Desativar'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

const ResetPasswordDialog = ({
  target,
  isSelf,
  onClose,
  onSelfReset,
}: {
  target: StaffUser | null
  isSelf: boolean
  onClose: () => void
  onSelfReset: () => void
}) => {
  const reset = useResetStaffPassword()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setPassword('')
    setError(null)
    onClose()
  }

  const submit = () => {
    const parsed = passwordSchema.safeParse(password)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Senha inválida.')
      return
    }

    reset.mutate(
      { id: target!.id, input: { password: parsed.data } },
      {
        onSuccess: () => {
          close()
          // Redefinir a PRÓPRIA senha revoga as próprias sessões. Sem o logout
          // explícito o usuário ficaria numa tela que falha em toda chamada.
          if (isSelf) onSelfReset()
        },
        onError: (e) =>
          setError(e instanceof ApiError ? e.message : 'Não foi possível alterar a senha.'),
      },
    )
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open: boolean) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir senha de {target?.name}</DialogTitle>
          <DialogDescription>
            {isSelf
              ? 'Você será desconectado e precisará entrar novamente com a nova senha.'
              : 'As sessões abertas dessa pessoa serão encerradas. Combine a nova senha por um canal seguro.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nova-senha">Nova senha</Label>
          <Input
            id="nova-senha"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
          />
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={reset.isPending}>
            {reset.isPending ? 'Salvando…' : 'Alterar senha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
