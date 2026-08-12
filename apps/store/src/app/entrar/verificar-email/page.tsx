'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { resendVerification, verifyEmail } from '@/lib/account'
import { authErrorMessage } from '@/lib/auth'
import { useBrandLogo } from '@/components/brand-logo-provider'
import { StoreLogo } from '@/components/store-logo'
import { fieldClass, submitButtonClass } from '@/lib/utils'

/**
 * Confirmação de e-mail. O token chega por query string e é apagado da URL assim
 * que lido: sem isso ele fica no histórico do navegador e no Referer.
 *
 * O <Suspense> não é enfeite — `useSearchParams` sem ele quebra o `next build`
 * (e passa no `next dev`, que é como o erro chega em produção).
 */
export default function VerificarEmailPage() {
  return (
    <Suspense fallback={<Shell title="Confirmando…" />}>
      <VerificarEmail />
    </Suspense>
  )
}

type Status = 'verifying' | 'success' | 'error'

function VerificarEmail() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = useState<Status>('verifying')
  const [error, setError] = useState<string | null>(null)

  // O StrictMode do dev roda o efeito duas vezes. Sem esta trava, a segunda
  // chamada usa um token já consumido e mostra "link inválido" numa confirmação
  // que, na verdade, deu certo.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const token = params.get('token')
    if (!token) {
      setStatus('error')
      setError('Link incompleto. Abra o endereço exatamente como está no e-mail.')
      return
    }

    void (async () => {
      try {
        await verifyEmail(token)
        setStatus('success')
        // Só depois do sucesso: o token foi consumido e não serve mais. Limpar a
        // URL numa falha de rede tiraria do cliente a chance de recarregar a
        // página com um token que ainda é válido.
        router.replace(pathname)
      } catch (e) {
        setStatus('error')
        setError(authErrorMessage(e))
      }
    })()
  }, [params, pathname, router])

  if (status === 'verifying') return <Shell title="Confirmando o seu e-mail…" />

  if (status === 'success') {
    return (
      <Shell title="E-mail confirmado!">
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Sua conta está pronta. Agora é só entrar.
        </p>
        <Link href="/entrar" className={`${submitButtonClass} flex items-center justify-center`}>
          Entrar na minha conta
        </Link>
      </Shell>
    )
  }

  return (
    <Shell title="Não foi possível confirmar">
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <ResendForm />
    </Shell>
  )
}

/** Reenvio a partir do e-mail digitado: o token que falhou é um hash, não temos
 *  como saber de quem ele era — e descobrir por tentativa seria enumeração. */
function ResendForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (sent) {
    return (
      <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        Se existir uma conta com esse e-mail aguardando confirmação, enviamos um link novo.
        Confira também a caixa de spam.
      </p>
    )
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        setSending(true)
        try {
          await resendVerification(email.trim().toLowerCase())
          setSent(true)
        } catch (err) {
          setError(authErrorMessage(err))
        } finally {
          setSending(false)
        }
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="v-email" className="text-sm font-medium">
          Receber um link novo
        </label>
        <input
          id="v-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          className={fieldClass}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <button type="submit" disabled={sending} className={submitButtonClass}>
        {sending ? 'Enviando…' : 'Reenviar confirmação'}
      </button>
    </form>
  )
}

function Shell({ title, children }: { title: string; children?: React.ReactNode }) {
  const logoUrl = useBrandLogo()

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <StoreLogo src={logoUrl} alt="" size={64} className="size-16" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      <div className="rounded-xl border border-border bg-card p-6 shadow-soft">{children}</div>
    </main>
  )
}
