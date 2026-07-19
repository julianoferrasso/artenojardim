import type { ErrorResponse, PaginationMeta } from '@ecommerce/shared/contracts'
import { ROUTES } from '@ecommerce/shared/constants'

/**
 * O admin fala com a API só do BROWSER: cada tela é autenticada e por usuário,
 * então não há nada a renderizar no servidor que valha cache.
 *
 * O access token vive em MEMÓRIA — nunca em localStorage. XSS lê localStorage
 * trivialmente; memória morre com a aba. O refresh token é cookie HttpOnly, que
 * o JS não enxerga nem com XSS.
 *
 * O custo dessa escolha é que um F5 perde o access token. Por isso o app chama
 * /refresh no boot: o cookie sobrevive ao reload e reconstrói a sessão.
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

const parseError = async (res: Response): Promise<ApiError> => {
  // Um 502 do Nginx ou um timeout não têm corpo JSON. Sem este catch, o erro
  // real vira "Unexpected token < in JSON", que esconde a causa de quem depura.
  const body = (await res.json().catch(() => null)) as ErrorResponse | null
  return new ApiError(
    body?.error.code ?? 'INTERNAL_ERROR',
    body?.error.message ?? `Erro ${res.status} ao chamar a API`,
    res.status,
    body?.error.details,
    body?.error.requestId,
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
 * Sem isto, as três renovam em paralelo, cada uma rotaciona o token e as duas
 * perdedoras acabam apresentando um token já revogado — o que a API,
 * corretamente, interpreta como TOKEN ROUBADO e derruba a sessão inteira.
 * O usuário seria deslogado por usar o app rápido demais.
 */
let refreshInFlight: Promise<boolean> | undefined

const refreshSession = async (): Promise<boolean> => {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${baseUrl()}${ROUTES.auth.admin.refresh}`, {
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

/** Faz o request, renovando o token uma vez em caso de expiração. Devolve o
 *  corpo cru — os desembrulhadores abaixo escolhem o que extrair. */
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

export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await request(path, init)
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T

  const json = (await res.json()) as { data: T }
  return json.data
}

/** Para as rotas paginadas: preserva o `meta` que o apiFetch normal descarta.
 *  Passa pela MESMA renovação de token — não reimplemente fetch na página. */
export const apiFetchPaginated = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T[]; meta: PaginationMeta }> => {
  const res = await request(path, init)
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as { data: T[]; meta: PaginationMeta }
}

export const bootstrapSession = refreshSession
