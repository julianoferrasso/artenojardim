'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createStaffUserSchema,
  updateStaffUserSchema,
  canManageUser,
  DENIAL_MESSAGE,
  type CreateStaffUserInput,
  type StaffUser,
} from '@ecommerce/shared/contracts'
import { USER_ROLES, ROLE_RANK, type UserRole } from '@ecommerce/shared/constants'
import { useCreateStaffUser, useUpdateStaffUser, ROLE_LABEL, ROLE_HINT } from '@/lib/users'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

type Props = {
  initial?: StaffUser
  onDone: () => void
  onCancel: () => void
}

/**
 * Criar/editar usuário. O MESMO schema que a API valida roda aqui — mudar um
 * campo quebra o build no mesmo commit.
 *
 * A senha só existe na CRIAÇÃO. Trocar senha de alguém que já existe é outra
 * ação, com outro endpoint, porque derruba as sessões do alvo.
 */
export const StaffUserForm = ({ initial, onDone, onCancel }: Props) => {
  const { user } = useAuth()
  const create = useCreateStaffUser()
  const update = useUpdateStaffUser()
  const [formError, setFormError] = useState<string | null>(null)

  const editing = Boolean(initial)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateStaffUserInput>({
    // Na edição o schema não tem `password`; o cast alinha os dois formatos, que
    // divergem só nesse campo.
    resolver: zodResolver(
      (editing ? updateStaffUserSchema : createStaffUserSchema) as typeof createStaffUserSchema,
    ),
    defaultValues: initial
      ? { name: initial.name, email: initial.email, role: initial.role }
      : { role: 'STAFF' },
  })

  const busy = create.isPending || update.isPending

  // Ninguém concede o que não tem: o seletor só oferece cargos até o do ator.
  // A API rejeita de qualquer forma — isto evita oferecer a porta que não abre.
  const assignableRoles = user
    ? USER_ROLES.filter((r) => ROLE_RANK[r] <= ROLE_RANK[user.role])
    : []

  // Mudar o próprio cargo é proibido nos dois sentidos (escalada para cima,
  // loja sem dono para baixo). Pergunta à mesma função que a API usa.
  const roleDecision =
    user && initial
      ? canManageUser({ id: user.id, role: user.role }, initial, 'update', 'OWNER')
      : { allowed: true as const }
  const roleLocked =
    !roleDecision.allowed && roleDecision.reason === 'CANNOT_CHANGE_OWN_ROLE'

  const onSubmit = (values: CreateStaffUserInput) => {
    setFormError(null)

    const onError = (e: unknown) =>
      setFormError(e instanceof ApiError ? e.message : 'Não foi possível salvar.')

    if (initial) {
      // Sem `password` no update — o contrato não aceita, e o campo nem existe.
      const input = { name: values.name, email: values.email, role: values.role }
      update.mutate({ id: initial.id, input }, { onSuccess: onDone, onError })
    } else {
      create.mutate(values, { onSuccess: onDone, onError })
    }
  }

  const field =
    'h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
      noValidate
    >
      <h2 className="font-medium">{editing ? 'Editar usuário' : 'Novo usuário'}</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Nome
        </label>
        <input
          id="name"
          autoFocus
          {...register('name')}
          className={cn(field, errors.name && 'border-destructive')}
          aria-invalid={!!errors.name}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="off"
          {...register('email')}
          className={cn(field, errors.email && 'border-destructive')}
          aria-invalid={!!errors.email}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      {!editing && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Senha
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
            className={cn(field, errors.password && 'border-destructive')}
            aria-invalid={!!errors.password}
          />
          {errors.password ? (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Mínimo de 6 caracteres. Combine com a pessoa por um canal seguro — ela poderá
              trocar depois.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="role" className="text-sm font-medium">
          Cargo
        </label>
        <select
          id="role"
          {...register('role')}
          disabled={roleLocked}
          title={roleLocked ? DENIAL_MESSAGE.CANNOT_CHANGE_OWN_ROLE : undefined}
          className={cn(field, 'disabled:opacity-50')}
        >
          {assignableRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {roleLocked
            ? DENIAL_MESSAGE.CANNOT_CHANGE_OWN_ROLE
            : ROLE_HINT[(initial?.role ?? 'STAFF') as UserRole]}
        </p>
      </div>

      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="h-10 flex-1 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-md border border-border px-4 text-sm hover:bg-accent"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
