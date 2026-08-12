'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { unsubscribe } from '@/lib/account'
import { authErrorMessage } from '@/lib/auth'
import { AuthShell as Shell } from '@/components/auth-shell'
import { submitButtonClass } from '@/lib/utils'

/**
 * Descadastro dos e-mails de marketing, a partir do link do rodapé.
 *
 * Não exige login: quem assinou pela newsletter do rodapé não tem conta, e pedir
 * uma para sair da lista empurra a pessoa direto para o botão de spam.
 *
 * O POST acontece AQUI, no cliente, e não numa rota GET: um GET que muda estado
 * é disparado pelo pré-carregador de links do Outlook e por antivírus de e-mail,
 * descadastrando gente que nunca clicou em nada.
 *
 * O <Suspense> não é enfeite — `useSearchParams` sem ele quebra o `next build`
 * (e passa no `next dev`, que é como o erro chega em produção).
 */
export default function DescadastrarPage() {
  return (
    <Suspense fallback={<Shell title="Processando…" />}>
      <Descadastrar />
    </Suspense>
  )
}

type Status = 'working' | 'success' | 'error'

function Descadastrar() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = useState<Status>('working')
  const [error, setError] = useState<string | null>(null)

  // O StrictMode do dev roda o efeito duas vezes. A operação é idempotente no
  // servidor, mas a trava evita um segundo request inútil a cada carga.
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
        await unsubscribe(token)
        setStatus('success')
        // Só depois do sucesso: o token continua válido, e limpá-lo da URL numa
        // falha de rede tiraria do cliente a chance de recarregar a página.
        router.replace(pathname)
      } catch (e) {
        setStatus('error')
        setError(authErrorMessage(e))
      }
    })()
  }, [params, pathname, router])

  if (status === 'working') return <Shell title="Removendo você da lista…" />

  if (status === 'success') {
    return (
      <Shell title="Pronto, você saiu da lista">
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Não enviaremos mais novidades e promoções para este e-mail. Você continua recebendo os
          e-mails sobre os seus pedidos — esses são necessários para a compra.
        </p>
        <Link href="/" className={`${submitButtonClass} flex items-center justify-center`}>
          Voltar para a loja
        </Link>
      </Shell>
    )
  }

  return (
    <Shell title="Não foi possível descadastrar">
      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Se você tem conta na loja, também pode desativar as novidades em Conta → Preferências.
      </p>
      <Link href="/conta/preferencias" className={`${submitButtonClass} flex items-center justify-center`}>
        Ir para as preferências
      </Link>
    </Shell>
  )
}
