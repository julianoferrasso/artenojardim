'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginInput } from '@ecommerce/shared/contracts'
import { useAuth, authErrorMessage } from '@/lib/auth'
import { cn } from '@/lib/utils'

/**
 * O `loginSchema` é o MESMO que a API usa para validar. É a razão de
 * packages/shared existir: mudar um campo quebra o build aqui, no mesmo commit,
 * em vez de virar um 422 em produção.
 */
export default function LoginPage() {
  const { login } = useAuth()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (values: LoginInput) => {
    setFormError(null)
    try {
      await login(values)
    } catch (err) {
      setFormError(authErrorMessage(err))
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-sm">
        <header className="mb-6 flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Arte no Jardim</h1>
          <p className="text-sm text-muted-foreground">Entre no painel administrativo</p>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              {...register('email')}
              className={cn(
                'h-10 rounded-md border border-input bg-background px-3 text-sm',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring',
                errors.email && 'border-destructive',
              )}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <p id="email-error" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
              className={cn(
                'h-10 rounded-md border border-input bg-background px-3 text-sm',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring',
                errors.password && 'border-destructive',
              )}
              aria-invalid={!!errors.password}
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          {/* role="alert" para o leitor de tela anunciar o erro sem precisar de foco. */}
          {formError && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'h-10 rounded-md bg-primary text-sm font-medium text-primary-foreground',
              'transition-opacity hover:opacity-90 disabled:opacity-50',
            )}
          >
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
