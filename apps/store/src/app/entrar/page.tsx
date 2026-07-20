'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from '@ecommerce/shared/contracts'
import { useAuth, authErrorMessage } from '@/lib/auth'
import { cn } from '@/lib/utils'

type Mode = 'login' | 'register'

export default function EntrarPage() {
  const [mode, setMode] = useState<Mode>('login')

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <Image src="/logo-bird.png" alt="" width={64} height={64} className="size-16" />
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

const field =
  'h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'

function LoginForm() {
  const { login } = useAuth()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        setError(null)
        try {
          await login(v)
          router.replace('/conta')
        } catch (e) {
          setError(authErrorMessage(e))
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
      </div>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={isSubmitting} className="h-11 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-soft transition-all duration-200 hover:bg-primary/90 disabled:opacity-50">
        {isSubmitting ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}

function RegisterForm() {
  const { register: signup } = useAuth()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) })

  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        setError(null)
        try {
          await signup(v)
          router.replace('/conta')
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
        <span className="text-xs text-muted-foreground">Mínimo 12 caracteres.</span>
      </div>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={isSubmitting} className="h-11 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-soft transition-all duration-200 hover:bg-primary/90 disabled:opacity-50">
        {isSubmitting ? 'Criando…' : 'Criar conta'}
      </button>
    </form>
  )
}
