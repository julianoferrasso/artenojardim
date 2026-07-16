import type { ErrorResponse } from '@ecommerce/shared/contracts'

/**
 * O admin fala com a API só do BROWSER: cada tela é autenticada e por usuário,
 * então não há nada a renderizar no servidor que valha cache.
 *
 * O access token vive em MEMÓRIA (nunca localStorage — XSS lê localStorage;
 * memória morre com a aba). O refresh token é cookie HttpOnly, que o JS não vê.
 */

let accessToken: string | undefined

export const setAccessToken = (token: string | undefined): void => {
  accessToken = token
}

export const getAccessToken = (): string | undefined => accessToken

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Array<{ field: string; message: string }>,
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const baseUrl = (): string => {
  const url = process.env.NEXT_PUBLIC_API_URL
  if (!url) throw new Error('NEXT_PUBLIC_API_URL não configurada')
  return url
}

export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
    credentials: 'include',
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ErrorResponse | null

    throw new ApiError(
      body?.error.code ?? 'INTERNAL_ERROR',
      body?.error.message ?? `Erro ${res.status} ao chamar a API`,
      res.status,
      body?.error.details,
      body?.error.requestId,
    )
  }

  if (res.status === 204) return undefined as T

  const json = (await res.json()) as { data: T }
  return json.data
}
