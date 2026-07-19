'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ROUTES } from '@ecommerce/shared/constants'
import type { AuthCustomer, LoginInput, RegisterInput } from '@ecommerce/shared/contracts'
import { ApiError } from './api'

/**
 * Auth de cliente no browser. Como o admin: access token em MEMÓRIA (nunca
 * localStorage — XSS lê localStorage), refresh em cookie HttpOnly. Um F5 perde o
 * access token; o bootstrap chama /refresh no boot e reconstrói a sessão.
 *
 * NÃO usa o apiFetch de catalog (server-only). Aqui é tudo client-side, batendo
 * no domínio público da API com credentials para o cookie viajar.
 */

let accessToken: string | undefined

/** O carrinho (outro contexto) precisa do token para anexar o Bearer. */
export const getAccessToken = (): string | undefined => accessToken

const apiBase = (): string => {
  const url = process.env.NEXT_PUBLIC_API_URL
  if (!url) throw new Error('NEXT_PUBLIC_API_URL não configurada')
  return url
}

const call = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(
      body?.error?.code ?? 'INTERNAL_ERROR',
      body?.error?.message ?? `Erro ${res.status}`,
      res.status,
    )
  }
  if (res.status === 204) return undefined as T
  return ((await res.json()) as { data: T }).data
}

type SessionResp = { customer: AuthCustomer; tokens: { accessToken: string } }

type AuthState = {
  customer: AuthCustomer | null
  loading: boolean
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [customer, setCustomer] = useState<AuthCustomer | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await call<SessionResp>(ROUTES.auth.refresh, { method: 'POST' })
        if (cancelled) return
        accessToken = data.tokens.accessToken
        const me = await call<{ customer: AuthCustomer }>(ROUTES.auth.me)
        if (!cancelled) setCustomer(me.customer)
      } catch {
        // Sem sessão — visitante anônimo, normal.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const apply = (data: SessionResp) => {
    accessToken = data.tokens.accessToken
    setCustomer(data.customer)
  }

  const login = async (input: LoginInput) => apply(await call<SessionResp>(ROUTES.auth.login, {
    method: 'POST',
    body: JSON.stringify(input),
  }))

  const register = async (input: RegisterInput) => apply(await call<SessionResp>(ROUTES.auth.register, {
    method: 'POST',
    body: JSON.stringify(input),
  }))

  const logout = async () => {
    try {
      await call(ROUTES.auth.logout, { method: 'POST' })
    } catch {
      /* estado local limpa de qualquer forma */
    }
    accessToken = undefined
    setCustomer(null)
  }

  return (
    <AuthContext.Provider value={{ customer, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}

export const authErrorMessage = (err: unknown): string => {
  if (!(err instanceof ApiError)) return 'Não foi possível conectar. Tente novamente.'
  switch (err.code) {
    case 'INVALID_CREDENTIALS':
      return 'E-mail ou senha inválidos.'
    case 'EMAIL_ALREADY_EXISTS':
      return 'Já existe uma conta com este e-mail. Faça login.'
    case 'RATE_LIMITED':
      return 'Muitas tentativas. Aguarde alguns minutos.'
    default:
      return err.message
  }
}
