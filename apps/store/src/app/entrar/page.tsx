'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from '@ecommerce/shared/contracts'
import { ApiError } from '@/lib/api'
import { registerAccount, resendVerification } from '@/lib/account'
import { useAuth, authErrorMessage } from '@/lib/auth'
import { useBrandLogo } from '@/components/brand-logo-provider'
import { StoreLogo } from '@/components/store-logo'
import { cn, fieldClass as field, submitButtonClass } from '@/lib/utils'

type Mode = 'login' | 'register'

export default function EntrarPage() {
  const [mode, setMode] = useState<Mode>('login')
  const logoUrl = useBrandLogo()

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <StoreLogo src={logoUrl} alt="" size={64} className="size-16" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {mode === 'login' ? 'Que bom te ver de novo' : 'Crie a sua conta'}
        </h1>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
        <div className="mb-6 flex rounded-lg border border-border bg-muted/50 p-1">
          {(['login', 'register'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 rounded-md py-2 text-sm font-medium transition-colors',
                mode === m ? 'bg-primary text-primary-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>

        {mode === 'login' ? <LoginForm /> : <RegisterForm />}
      </div>
    </main>
  )
}

function LoginForm() {
  const { login } = useAuth()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  /** Só o e-mail não confirmado tem saída própria: reenviar o link. */
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        setError(null)
        setUnverifiedEmail(null)
        try {
          await login(v)
          router.replace('/conta')
        } catch (e) {
          setError(authErrorMessage(e))
          if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') {
            setUnverifiedEmail(v.email)
          }
        }
      })}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="l-email" className="text-sm font-medium">E-mail</label>
        <input id="l-email" type="email" autoComplete="username" autoFocus {...register('email')} className={field} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="l-pass" className="text-sm font-medium">Senha</label>
        <input id="l-pass" type="password" autoComplete="current-password" {...register('password')} className={field} />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        <Link href="/entrar/esqueci-senha" className="self-end text-xs text-muted-foreground hover:text-foreground">
          Esqueci minha senha
        </Link>
      </div>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {unverifiedEmail && <ResendVerification email={unverifiedEmail} />}
      <button type="submit" disabled={isSubmitting} className={submitButtonClass}>
        {isSubmitting ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}

/**
 * Botão de reenvio. Aparece depois de um login recusado por falta de confirmação
 * — sem ele, o cliente lê "confirme o seu e-mail" e não tem o que fazer se o
 * e-mail original se perdeu.
 */
function ResendVerification({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')

  if (state === 'sent') {
    return (
      <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        Enviamos um link novo para <strong className="font-medium">{email}</strong>. Confira também
        a caixa de spam.
      </p>
    )
  }

  return (
    <button
      type="button"
      disabled={state === 'sending'}
      onClick={async () => {
        setState('sending')
        try {
          await resendVerification(email)
          setState('sent')
        } catch {
          // A resposta da API é genérica de propósito; insistir num erro aqui
          // não ajudaria o cliente, e o botão continua disponível.
          setState('idle')
        }
      }}
      className="h-10 rounded-lg border border-border bg-card text-sm font-medium transition-colors hover:bg-muted/50 disabled:opacity-50"
    >
      {state === 'sending' ? 'Enviando…' : 'Reenviar e-mail de confirmação'}
    </button>
  )
}

function RegisterForm() {
  const [error, setError] = useState<string | null>(null)
  /** Preenchido quando a conta nasce: a partir daí a tela vira "confirme o e-mail". */
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) })

  // A conta existe, mas ainda não entra: o cadastro não emite sessão.
  if (pendingEmail) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Conta criada! Enviamos um link de confirmação para{' '}
          <strong className="font-medium text-foreground">{pendingEmail}</strong>. Abra o e-mail
          para liberar o acesso — o link vale por 24 horas.
        </p>
        <p className="text-sm text-muted-foreground">
          Não chegou? Confira a caixa de spam ou peça outro.
        </p>
        <ResendVerification email={pendingEmail} />
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        setError(null)
        try {
          const result = await registerAccount(v)
          setPendingEmail(result.email)
        } catch (e) {
          setError(authErrorMessage(e))
        }
      })}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="r-name" className="text-sm font-medium">Nome</label>
        <input id="r-name" autoComplete="name" autoFocus {...register('name')} className={field} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="r-email" className="text-sm font-medium">E-mail</label>
        <input id="r-email" type="email" autoComplete="username" {...register('email')} className={field} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="r-pass" className="text-sm font-medium">Senha</label>
        <input id="r-pass" type="password" autoComplete="new-password" {...register('password')} className={field} />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        <span className="text-xs text-muted-foreground">Mínimo 6 caracteres.</span>
      </div>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={isSubmitting} className={submitButtonClass}>
        {isSubmitting ? 'Criando…' : 'Criar conta'}
      </button>
    </form>
  )
}
