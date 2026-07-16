'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

const PUBLIC_PATHS = ['/entrar']

/**
 * Redireciona quem não está logado para /entrar.
 *
 * Isto é CONVENIÊNCIA DE UX, não segurança. Quem desabilitar o JS ou chamar a
 * API direto passa por aqui sem esforço — a proteção real é o `authenticate` na
 * API, que é quem tem os dados. Um guard no front que "protege" rota é teatro.
 */
export const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const isPublic = PUBLIC_PATHS.includes(pathname)

  useEffect(() => {
    if (loading) return

    // Já logado e na tela de login: manda para o painel.
    if (user && isPublic) {
      router.replace('/')
      return
    }
    if (!user && !isPublic) router.replace('/entrar')
  }, [loading, user, isPublic, router])

  // Rota pública NÃO espera o bootstrap.
  //
  // O guard antes segurava tudo atrás de "Carregando…", inclusive /entrar — e
  // /entrar é justamente a tela de quem NÃO tem sessão. O resultado era todo
  // visitante encarando um spinner enquanto uma chamada de /refresh, fadada a
  // falhar, ia e voltava. O formulário tem que aparecer na hora.
  if (isPublic) return <>{children}</>

  // Aqui o wait se justifica: sem ele, a tela pisca "não logado" e redireciona
  // antes do bootstrap terminar — deslogando quem tinha sessão válida.
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    )
  }

  if (!user) return null

  return <>{children}</>
}
