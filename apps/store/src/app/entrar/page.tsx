'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  emailSchema,
  loginSchema,
  registerFormSchema,
  type LoginInput,
  type RegisterFormInput,
  type RegisterFormOutput,
} from '@ecommerce/shared/contracts'
import { ApiError } from '@/lib/api'
import { changePassword, registerAccount, requestEmailCode } from '@/lib/account'
import { useAuth, authErrorMessage, type SessionResp } from '@/lib/auth'
import { nextFromLocation } from '@/lib/next-path'
import { useBrandLogo } from '@/components/brand-logo-provider'
import { StoreLogo } from '@/components/store-logo'
import { EmailCodeStep, resendWaitSeconds } from '@/components/email-code-step'
import { cn, fieldClass as field, submitButtonClass } from '@/lib/utils'

type Mode = 'login' | 'register'

/** O código foi enviado (ou um acabou de sair): a tela vira o passo do código. */
type CodeSent = { email: string; resendInSeconds: number }

const secondaryButtonClass =
  'h-10 rounded-lg border border-border bg-card text-sm font-medium transition-colors hover:bg-muted/50 disabled:opacity-50'

/**
 * Pede um código e devolve o passo seguinte. "Cedo demais" não é erro aqui: um
 * código acabou de sair para este e-mail, e é só digitá-lo.
 */
const sendCode = async (email: string): Promise<CodeSent> => {
  try {
    return await requestEmailCode(email)
  } catch (err) {
    const wait = resendWaitSeconds(err)
    if (wait !== null) return { email, resendInSeconds: wait }
    throw err
  }
}

/**
 * Entra com a sessão que o código devolveu. Se a pessoa tinha digitado uma senha
 * (cadastro, ou login de conta ainda não confirmada), ela é gravada AGORA: senha
 * só existe em conta confirmada, e esta acabou de ser. Falhar aqui não desfaz o
 * login — a conta segue entrando por código, e a senha pode ser criada em Meus dados.
 */
const useFinishWithCode = () => {
  const { applySession } = useAuth()
  const router = useRouter()

  return async (session: SessionResp, heldPassword?: string) => {
    applySession(session)
    if (heldPassword && !session.customer.hasPassword) {
      try {
        applySession(await changePassword({ password: heldPassword }))
      } catch {
        /* a conta já está dentro; a senha fica para Meus dados */
      }
    }
    router.replace(nextFromLocation())
  }
}

export default function EntrarPage() {
  const [mode, setMode] = useState<Mode>('login')
  /** Vindo do cadastro ("já existe conta") ou do link vencido: abre direto no código. */
  const [codeFor, setCodeFor] = useState<{ email: string } | null>(null)
  const logoUrl = useBrandLogo()

  // `?modo=codigo` (link de confirmação vencido): lido depois de montar, para o
  // HTML do servidor e o do navegador nascerem iguais.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('modo') === 'codigo') setCodeFor({ email: '' })
  }, [])

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

        {mode === 'login' ? (
          <LoginForm key={codeFor ? `code:${codeFor.email}` : 'password'} codeFor={codeFor} />
        ) : (
          <RegisterForm
            onUseCode={(email) => {
              setCodeFor({ email })
              setMode('login')
            }}
          />
        )}
      </div>
    </main>
  )
}

function LoginForm({ codeFor }: { codeFor: { email: string } | null }) {
  const { login } = useAuth()
  const router = useRouter()
  const finish = useFinishWithCode()
  const [withCode, setWithCode] = useState(!!codeFor)
  const [error, setError] = useState<string | null>(null)
  /** Código a caminho: por escolha ("entrar com código") ou porque o e-mail não estava confirmado. */
  const [sent, setSent] = useState<CodeSent | null>(null)
  /** A senha que acabou de conferir numa conta não confirmada: volta a valer depois do código. */
  const [heldPassword, setHeldPassword] = useState<string | undefined>(undefined)
  const [unverified, setUnverified] = useState(false)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: codeFor?.email ?? '', password: '' },
  })
  const [codeEmail, setCodeEmail] = useState(codeFor?.email ?? '')
  const [sending, setSending] = useState(false)

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        {unverified && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            Falta só confirmar o seu e-mail. Digite o código e você já entra.
          </p>
        )}
        <EmailCodeStep
          key={sent.email}
          email={sent.email}
          resendInSeconds={sent.resendInSeconds}
          onVerified={(session) => finish(session, heldPassword)}
          onChangeEmail={() => {
            setSent(null)
            setUnverified(false)
            setHeldPassword(undefined)
          }}
          submitLabel="Entrar"
        />
      </div>
    )
  }

  if (withCode) {
    const startCode = async () => {
      const parsed = emailSchema.safeParse(codeEmail.trim())
      if (!parsed.success) {
        setError('Informe um e-mail válido.')
        return
      }
      setSending(true)
      setError(null)
      try {
        setSent(await sendCode(parsed.data))
      } catch (e) {
        setError(authErrorMessage(e))
      } finally {
        setSending(false)
      }
    }

    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void startCode()
        }}
        className="flex flex-col gap-4"
        noValidate
      >
        <p className="text-sm text-muted-foreground">
          Mandamos um código de 6 dígitos para o seu e-mail — sem senha. Se ainda não tem conta, ela é criada aqui.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="c-email" className="text-sm font-medium">E-mail</label>
          <input
            id="c-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            value={codeEmail}
            onChange={(e) => setCodeEmail(e.target.value)}
            className={field}
          />
        </div>
        {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={sending} className={submitButtonClass}>
          {sending ? 'Enviando…' : 'Enviar código'}
        </button>
        <button type="button" onClick={() => setWithCode(false)} className={secondaryButtonClass}>
          Entrar com senha
        </button>
      </form>
    )
  }

  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        setError(null)
        try {
          await login(v)
          router.replace(nextFromLocation())
        } catch (e) {
          // A senha conferiu (a API só diz isto depois de conferir), mas o e-mail
          // nunca foi confirmado: em vez do beco sem saída, o código vem na hora.
          if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') {
            try {
              setHeldPassword(v.password)
              setUnverified(true)
              setSent(await sendCode(v.email))
              return
            } catch (sendErr) {
              setError(authErrorMessage(sendErr))
              return
            }
          }
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
        <Link href="/entrar/esqueci-senha" className="self-end text-xs text-muted-foreground hover:text-foreground">
          Esqueci minha senha
        </Link>
      </div>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={isSubmitting} className={submitButtonClass}>
        {isSubmitting ? 'Entrando…' : 'Entrar'}
      </button>
      <button
        type="button"
        onClick={() => {
          setCodeEmail(getValues('email'))
          setError(null)
          setWithCode(true)
        }}
        className={secondaryButtonClass}
      >
        Entrar com código por e-mail
      </button>
    </form>
  )
}

function RegisterForm({ onUseCode }: { onUseCode: (email: string) => void }) {
  const finish = useFinishWithCode()
  const [error, setError] = useState<string | null>(null)
  const [existingEmail, setExistingEmail] = useState<string | null>(null)
  /** Preenchido quando a conta nasce: a partir daí a tela vira o passo do código. */
  const [pending, setPending] = useState<(CodeSent & { name: string; password: string }) | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInput, unknown, RegisterFormOutput>({
    resolver: zodResolver(registerFormSchema),
    // Sem defaultValues o `.default(true)` do contrato não serve para nada aqui:
    // uma caixa desmarcada envia `false`, não `undefined`, e o default nunca é
    // exercido. É esta linha que faz a caixa nascer marcada.
    defaultValues: { acceptsMarketing: true },
  })

  // A conta existe, mas ainda não entra: falta o código (ou o link do e-mail).
  if (pending) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Conta criada! Falta confirmar o e-mail. Se preferir, o link do e-mail também confirma e já entra.
        </p>
        <EmailCodeStep
          email={pending.email}
          resendInSeconds={pending.resendInSeconds}
          name={pending.name}
          onVerified={(session) => finish(session, pending.password)}
          submitLabel="Confirmar e entrar"
        />
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        setError(null)
        setExistingEmail(null)
        try {
          // A senha NÃO vai no cadastro: ela fica nesta aba e é gravada depois do código.
          const result = await registerAccount({
            name: v.name,
            email: v.email,
            acceptsMarketing: v.acceptsMarketing,
            next: nextFromLocation('/conta'),
          })
          setPending({ email: result.email, resendInSeconds: result.resendInSeconds, name: v.name, password: v.password })
        } catch (e) {
          if (e instanceof ApiError && e.code === 'EMAIL_ALREADY_EXISTS') setExistingEmail(v.email)
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
      {/* Marcada por padrão (defaultValues acima). O mesmo controle mora em
          /conta/preferencias, para quem mudar de ideia depois. */}
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          {...register('acceptsMarketing')}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span className="text-sm text-muted-foreground">
          Quero receber novidades e promoções por e-mail. Você pode desmarcar quando quiser.
        </span>
      </label>
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {existingEmail && (
        <button type="button" onClick={() => onUseCode(existingEmail)} className={secondaryButtonClass}>
          Entrar com código por e-mail
        </button>
      )}
      <button type="submit" disabled={isSubmitting} className={submitButtonClass}>
        {isSubmitting ? 'Criando…' : 'Criar conta'}
      </button>
    </form>
  )
}
