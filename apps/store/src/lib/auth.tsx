'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type { AuthCustomer, LoginInput, RegisterInput } from '@ecommerce/shared/contracts'
import { ApiError } from './api'
import { clientFetch as call, setAccessToken } from './client'

/**
 * Auth de cliente no browser. Como o admin: access token em MEMÓRIA (nunca
 * localStorage — XSS lê localStorage), refresh em cookie HttpOnly. Um F5 perde o
 * access token; o bootstrap chama /refresh no boot e reconstrói a sessão.
 *
 * O token e o fetch autenticado moram em `./client`. Este arquivo cuida só da
 * SESSÃO — quem está logado, como entra e como sai.
 */

/**
 * Re-export: `cart.tsx`, `addresses.ts` e `checkout.ts` ainda têm o próprio
 * `call()` e importam o token daqui.
 *
 * PENDÊNCIA: enquanto não migrarem para `./client`, esses três NÃO ganham a
 * renovação silenciosa — o carrinho volta a falhar com 401 numa aba aberta há
 * mais de 15 minutos. É trocar três blocos de ~20 linhas por um import.
 */
export { getAccessToken } from './client'

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
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = await call<SessionResp>(ROUTES.auth.refresh, { method: 'POST' })
        if (cancelled) return
        setAccessToken(data.tokens.accessToken)
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
    setAccessToken(data.tokens.accessToken)
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
    setAccessToken(undefined)
    setCustomer(null)
    // Sem isto, os pedidos do cliente anterior ficariam no cache e apareceriam
    // por um instante para quem logasse em seguida no mesmo navegador.
    queryClient.clear()
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
