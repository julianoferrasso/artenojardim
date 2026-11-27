'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { verifyEmail } from '@/lib/account'
import { authErrorMessage, useAuth } from '@/lib/auth'
import { safeNextPath } from '@/lib/next-path'
import { AuthShell as Shell } from '@/components/auth-shell'
import { submitButtonClass } from '@/lib/utils'

/**
 * O link do e-mail de cadastro: confirma e JÁ ENTRA, voltando para onde o
 * cliente estava (`next`, ex.: o checkout).
 *
 * Por BOTÃO, e não automático ao abrir: scanners de e-mail corporativo (Safe
 * Links e afins) abrem o link — alguns rodando JavaScript — antes do cliente, e
 * um POST disparado no carregamento gastava o token de uso único. Ninguém além
 * do cliente clica no botão.
 *
 * O <Suspense> não é enfeite — `useSearchParams` sem ele quebra o `next build`
 * (e passa no `next dev`, que é como o erro chega em produção).
 */
export default function VerificarEmailPage() {
  return (
    <Suspense fallback={<Shell title="Confirme o seu e-mail" />}>
      <VerificarEmail />
    </Suspense>
  )
}

function VerificarEmail() {
  const params = useSearchParams()
  const router = useRouter()
  const { applySession } = useAuth()
  const [state, setState] = useState<'idle' | 'verifying' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const token = params.get('token')
  const next = safeNextPath(params.get('next'))

  if (!token) {
    return (
      <Shell title="Link incompleto">
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Abra o endereço exatamente como está no e-mail — ou entre com um código.
        </p>
        <CodeLink next={next} />
      </Shell>
    )
  }

  const confirm = async () => {
    setState('verifying')
    setError(null)
    try {
      applySession(await verifyEmail(token))
      // O token já foi gasto: `replace` tira da URL (e do histórico) o que não vale mais.
      router.replace(next)
    } catch (e) {
      setState('error')
      setError(authErrorMessage(e))
    }
  }

  if (state === 'error') {
    return (
      <Shell title="Não foi possível confirmar">
        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Sem problema: entre com um código enviado ao seu e-mail. Ele também confirma a conta.
        </p>
        <CodeLink next={next} />
      </Shell>
    )
  }

  return (
    <Shell title="Confirme o seu e-mail">
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Toque no botão para confirmar que este e-mail é seu. Você já entra na sua conta.
      </p>
      <button
        type="button"
        onClick={() => void confirm()}
        disabled={state === 'verifying'}
        className={`${submitButtonClass} w-full`}
      >
        {state === 'verifying' ? 'Confirmando…' : 'Confirmar e entrar'}
      </button>
    </Shell>
  )
}

function CodeLink({ next }: { next: string }) {
  return (
    <Link
      href={`/entrar?modo=codigo&next=${encodeURIComponent(next)}`}
      className={`${submitButtonClass} flex items-center justify-center`}
    >
      Entrar com código
    </Link>
  )
}
