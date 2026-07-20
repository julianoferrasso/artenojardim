'use client'

import type { ErrorResponse, PaginationMeta } from '@ecommerce/shared/contracts'
import { ROUTES } from '@ecommerce/shared/constants'
import { ApiError } from './api'

/**
 * Cliente HTTP autenticado do browser — o único lugar da loja que anexa Bearer.
 *
 * O access token vive em MEMÓRIA (nunca localStorage: XSS lê localStorage
 * trivialmente); o refresh é cookie HttpOnly, invisível ao JS. Um F5 perde o
 * access token, e é por isso que o AuthProvider chama /refresh no boot.
 *
 * A diferença para o que a loja tinha antes é a RENOVAÇÃO SILENCIOSA: sem ela,
 * o access token expira em 15 minutos e qualquer aba deixada aberta — uma lista
 * de pedidos, por exemplo — passa a dar 401 até o cliente recarregar sozinho,
 * sem entender por quê.
 *
 * `ApiError` vem de `./api` de propósito. Redefinir a classe aqui faria
 * `err instanceof ApiError` mentir em metade da loja, dependendo de qual módulo
 * originou a chamada.
 */

let accessToken: string | undefined

export const setAccessToken = (token: string | undefined): void => {
  accessToken = token
}
export const getAccessToken = (): string | undefined => accessToken

const baseUrl = (): string => {
  const url = process.env.NEXT_PUBLIC_API_URL
  if (!url) throw new Error('NEXT_PUBLIC_API_URL não configurada')
  return url
}

const parseError = async (res: Response): Promise<ApiError> => {
  // Um 502 do Nginx não tem corpo JSON. Sem este catch, o erro real vira
  // "Unexpected token < in JSON" e esconde a causa de quem depura.
  const body = (await res.json().catch(() => null)) as ErrorResponse | null
  return new ApiError(
    body?.error.code ?? 'INTERNAL_ERROR',
    body?.error.message ?? `Erro ${res.status} ao chamar a API`,
    res.status,
    body?.error.details,
  )
}

const raw = async (path: string, init: RequestInit = {}): Promise<Response> =>
  fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
    // Sem isto o cookie de refresh não viaja e a sessão morre em 15 minutos.
    credentials: 'include',
  })

/**
 * Renovação concorrente: se três requisições receberem 401 ao mesmo tempo, uma
 * só chama /refresh e as outras esperam a mesma promise.
 *
 * Sem isto, as três renovam em paralelo, cada uma rotaciona o token, e as duas
 * perdedoras apresentam um token já revogado — o que a API, corretamente,
 * interpreta como token roubado e derruba a sessão inteira. O cliente seria
 * deslogado por navegar rápido demais.
 */
let refreshInFlight: Promise<boolean> | undefined

export const refreshSession = async (): Promise<boolean> => {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${baseUrl()}${ROUTES.auth.refresh}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) return false

      const json = (await res.json()) as { data: { tokens: { accessToken: string } } }
      setAccessToken(json.data.tokens.accessToken)
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = undefined
    }
  })()

  return refreshInFlight
}

const request = async (path: string, init: RequestInit): Promise<Response> => {
  let res = await raw(path, init)

  // Só TOKEN_EXPIRED renova. Um 401 por TOKEN_INVALID ou REFRESH_REUSED
  // significa "alguém forjou" ou "a sessão foi derrubada por segurança" —
  // tentar renovar aí seria insistir num incidente.
  if (res.status === 401 && accessToken) {
    const err = (await res.clone().json().catch(() => null)) as ErrorResponse | null
    if (err?.error.code === 'TOKEN_EXPIRED' && (await refreshSession())) {
      res = await raw(path, init)
    }
  }
  return res
}

export const clientFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await request(path, init)
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T

  const json = (await res.json()) as { data: T }
  return json.data
}

/** Para rotas paginadas: preserva o `meta` que o clientFetch descarta. */
export const clientFetchPaginated = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T[]; meta: PaginationMeta }> => {
  const res = await request(path, init)
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as { data: T[]; meta: PaginationMeta }
}
