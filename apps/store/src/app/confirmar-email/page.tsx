'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { confirmEmailChange } from '@/lib/account'
import { authErrorMessage } from '@/lib/auth'
import { AuthShell } from '@/components/auth-shell'
import { submitButtonClass } from '@/lib/utils'

/**
 * Confirmação da TROCA de e-mail (não do cadastro — aquela vive em
 * /entrar/verificar-email e consome outro tipo de token).
 *
 * Mora na RAIZ, fora de /conta, de propósito: o guard daquele layout manda para
 * o login quem não tem sessão, e quem clica neste link quase nunca está logado —
 * abriu o e-mail no celular, ou noutro navegador. A rota da API também é pública
 * pela mesma razão: a posse do token é a prova.
 *
 * O <Suspense> não é enfeite: `useSearchParams` sem ele quebra o `next build` —
 * e passa no `next dev`, que é como o erro chega em produção.
 */
export default function ConfirmarEmailPage() {
  return (
    <Suspense fallback={<AuthShell title="Confirmando…" />}>
      <ConfirmarEmail />
    </Suspense>
  )
}

type Status = 'verifying' | 'success' | 'error'

function ConfirmarEmail() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = useState<Status>('verifying')
  const [error, setError] = useState<string | null>(null)

  // O StrictMode do dev roda o efeito duas vezes. Sem esta trava, a segunda
  // chamada usa um token já consumido e mostra "link inválido" numa troca que,
  // na verdade, deu certo.
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
        await confirmEmailChange(token)
        setStatus('success')
        // Só depois do sucesso: numa falha de rede, limpar a URL tiraria do
        // cliente a chance de recarregar com um token que ainda vale.
        router.replace(pathname)
      } catch (e) {
        setStatus('error')
        setError(authErrorMessage(e))
      }
    })()
  }, [params, pathname, router])

  if (status === 'verifying') return <AuthShell title="Confirmando o seu novo e-mail…" />

  if (status === 'success') {
    return (
      <AuthShell title="E-mail alterado!">
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Por segurança, encerramos as sessões abertas nesta conta. Entre novamente usando o seu
          e-mail novo.
        </p>
        <Link href="/entrar" className={`${submitButtonClass} flex items-center justify-center`}>
          Ir para o login
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Não foi possível alterar">
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {/* Sem formulário de reenvio, ao contrário da confirmação de cadastro:
          pedir a troca de novo exige a senha, então o caminho é entrar na conta. */}
      <p className="mb-6 text-sm text-muted-foreground">
        Peça a troca de novo em Meus dados — por segurança, é preciso informar a sua senha.
      </p>
      <div className="flex flex-col gap-2">
        <Link
          href="/conta/dados"
          className={`${submitButtonClass} flex items-center justify-center`}
        >
          Ir para Meus dados
        </Link>
        <Link
          href="/entrar"
          className="text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Entrar na minha conta
        </Link>
      </div>
    </AuthShell>
  )
}
