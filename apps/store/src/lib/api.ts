import type { ErrorResponse, PaginationMeta } from '@ecommerce/shared/contracts'

/**
 * O ÚNICO caminho da loja para os dados.
 *
 * A loja NUNCA importa Prisma nem toca no Postgres — mesmo que o Next permita
 * fazer isso de um Server Component. É uma armadilha: no dia em que existir um
 * app mobile, um tema de terceiro ou uma API pública, a regra de negócio estaria
 * espalhada por três codebases.
 *
 * No servidor usa loopback (sem TLS, sem DNS, sem sair da máquina, ~0.2ms).
 * No browser usa o domínio público, porque 127.0.0.1 seria a máquina do cliente.
 */

const isServer = typeof window === 'undefined'

const baseUrl = (): string => {
  if (isServer) {
    const internal = process.env.INTERNAL_API_URL
    if (!internal) throw new Error('INTERNAL_API_URL não configurada')
    return internal
  }

  const publicUrl = process.env.NEXT_PUBLIC_API_URL
  if (!publicUrl) throw new Error('NEXT_PUBLIC_API_URL não configurada')
  return publicUrl
}

/**
 * Espelha o AppError da API. O front reage ao `code`, nunca ao texto da
 * `message` — texto é para humanos e muda sem aviso.
 */
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

type RequestOptions = RequestInit & {
  /** ISR: revalidate em segundos. Só tem efeito no servidor. */
  revalidate?: number | false
  tags?: string[]
}

const doFetch = async (path: string, options: RequestOptions): Promise<Response> => {
  const { revalidate, tags, ...init } = options

  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    // Cookie de sessão precisa viajar; sem isso o refresh token nunca chega.
    credentials: 'include',
    ...(isServer && revalidate !== undefined
      ? { next: { revalidate: revalidate === false ? undefined : revalidate, tags } }
      : {}),
  })

  if (!res.ok) {
    // Um erro da API sem corpo JSON (502 do Nginx, timeout) não pode virar um
    // "Unexpected token < in JSON" — isso esconde a causa real de quem depura.
    const body = (await res.json().catch(() => null)) as ErrorResponse | null

    throw new ApiError(
      body?.error.code ?? 'INTERNAL_ERROR',
      body?.error.message ?? `Erro ${res.status} ao chamar a API`,
      res.status,
      body?.error.details,
      body?.error.requestId,
    )
  }

  return res
}

export const apiFetch = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const res = await doFetch(path, options)
  if (res.status === 204) return undefined as T
  const json = (await res.json()) as { data: T }
  return json.data
}

/** Preserva o envelope paginado (data + meta) que apiFetch descartaria. */
export const apiFetchPaginated = async <T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T[]; meta: PaginationMeta }> => {
  const res = await doFetch(path, options)
  return (await res.json()) as { data: T[]; meta: PaginationMeta }
}
