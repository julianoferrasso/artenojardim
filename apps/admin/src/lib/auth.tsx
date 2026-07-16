'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ROUTES } from '@ecommerce/shared/constants'
import type { AuthUser, LoginInput } from '@ecommerce/shared/contracts'
import { apiFetch, setAccessToken, bootstrapSession, ApiError } from './api'

type AuthState = {
  user: AuthUser | null
  /** true até o bootstrap terminar. Sem isto, a tela pisca "não logado". */
  loading: boolean
  login: (input: LoginInput) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  /**
   * O access token vive em memória e morre no F5. O cookie de refresh sobrevive —
   * então uma chamada no boot reconstrói a sessão. É o preço de não usar
   * localStorage, e é barato.
   */
  useEffect(() => {
    let cancelled = false

    void (async () => {
      const ok = await bootstrapSession()
      if (cancelled) return

      if (!ok) {
        setLoading(false)
        return
      }

      try {
        const data = await apiFetch<{ user: AuthUser }>(ROUTES.auth.admin.me)
        if (!cancelled) setUser(data.user)
      } catch {
        if (!cancelled) setAccessToken(undefined)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const login = async (input: LoginInput): Promise<void> => {
    const data = await apiFetch<{ user: AuthUser; tokens: { accessToken: string } }>(
      ROUTES.auth.admin.login,
      { method: 'POST', body: JSON.stringify(input) },
    )
    setAccessToken(data.tokens.accessToken)
    setUser(data.user)
    router.replace('/')
  }

  const logout = async (): Promise<void> => {
    // Falha de rede não pode prender o usuário logado: o estado local limpa de
    // qualquer forma, e o token do servidor expira em 15 minutos.
    try {
      await apiFetch(ROUTES.auth.admin.logout, { method: 'POST' })
    } catch {
      /* ignora */
    }
    setAccessToken(undefined)
    setUser(null)
    router.replace('/entrar')
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  )
}

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}

/**
 * Mensagem para o usuário a partir do CODE, nunca do texto da API.
 * O texto é para humanos e muda; o code é contrato.
 */
export const authErrorMessage = (err: unknown): string => {
  if (!(err instanceof ApiError)) return 'Não foi possível conectar. Tente novamente.'

  switch (err.code) {
    case 'INVALID_CREDENTIALS':
      return 'E-mail ou senha inválidos.'
    case 'ACCOUNT_DISABLED':
      return 'Conta desativada. Fale com o administrador.'
    case 'RATE_LIMITED':
      return 'Muitas tentativas. Aguarde alguns minutos.'
    case 'REFRESH_REUSED':
      return 'Sua sessão foi encerrada por segurança. Entre novamente.'
    default:
      return err.message
  }
}
