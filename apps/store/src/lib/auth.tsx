'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type { AuthCustomer, LoginInput } from '@ecommerce/shared/contracts'
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

export type SessionResp = { customer: AuthCustomer; tokens: { accessToken: string } }

/**
 * `register` NÃO está aqui: o cadastro não cria sessão — o cliente precisa
 * confirmar o e-mail antes de entrar. Ele vive em `lib/account.ts`, junto das
 * outras chamadas que acontecem fora de uma sessão.
 */
type AuthState = {
  customer: AuthCustomer | null
  loading: boolean
  login: (input: LoginInput) => Promise<void>
  logout: () => Promise<void>
  /**
   * Aplica um perfil recém-salvo sem refazer o /auth/me. A tela de preferências
   * já recebe o AuthCustomer inteiro de volta do PATCH; ignorá-lo faria o toggle
   * voltar ao estado antigo no render seguinte.
   */
  applyProfile: (customer: AuthCustomer) => void
  /**
   * Aplica uma SESSÃO inteira: token novo + perfil. A troca de senha e o
   * "encerrar as outras sessões" devolvem uma, porque as duas revogam tudo e
   * reemitem para esta aba.
   *
   * Sem isto a aba seguiria com um access token REVOGADO até o próximo 401 — que,
   * sendo TOKEN_INVALID e não TOKEN_EXPIRED, o clientFetch corretamente não
   * renova. O cliente seria deslogado dois cliques depois de trocar a senha, sem
   * relação aparente com o que fez.
   */
  applySession: (data: SessionResp) => void
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
    <AuthContext.Provider
      value={{ customer, loading, login, logout, applyProfile: setCustomer, applySession: apply }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}

/**
 * Mensagem padrão por `code`. As telas de conta tratam alguns códigos ANTES de
 * cair aqui: logado, "E-mail ou senha inválidos" para um INVALID_CREDENTIALS é
 * ambíguo (a senha atual é que estava errada), e o "Faça login" do
 * EMAIL_ALREADY_EXISTS não faz sentido para quem já está dentro. O texto certo
 * depende do contexto; o code, não.
 */
export const authErrorMessage = (err: unknown): string => {
  if (!(err instanceof ApiError)) return 'Não foi possível conectar. Tente novamente.'
  switch (err.code) {
    case 'INVALID_CREDENTIALS':
      return 'E-mail ou senha inválidos.'
    case 'EMAIL_ALREADY_EXISTS':
      return 'Já existe uma conta com este e-mail. Faça login.'
    case 'EMAIL_NOT_VERIFIED':
      return 'Confirme o seu e-mail antes de entrar. Verifique a sua caixa de entrada.'
    case 'EMAIL_TOKEN_INVALID':
      return 'Este link expirou ou já foi utilizado. Solicite um novo.'
    case 'EMAIL_ALREADY_VERIFIED':
      return 'Este e-mail já foi confirmado. É só entrar.'
    case 'RATE_LIMITED':
      return 'Muitas tentativas. Aguarde alguns minutos.'
    default:
      return err.message
  }
}
