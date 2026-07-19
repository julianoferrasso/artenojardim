import { env } from '../../config/env.js'
import { externalServiceError } from '../../shared/errors.js'
import { getValidAccessToken } from './token.js'

/**
 * Requisição autenticada à API do Melhor Envio. Anexa o Bearer válido (renovado
 * por token.ts) e o User-Agent que eles EXIGEM: aplicação + e-mail de contato —
 * sem isso a API responde 403.
 */

const userAgent = (): string => {
  const email = env.MELHOR_ENVIO_CONTACT_EMAIL ?? 'contato@artenojardim.com.br'
  return `Arte no Jardim (${email})`
}

export const meRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = await getValidAccessToken()

  let res: Response
  try {
    res = await fetch(`${env.MELHOR_ENVIO_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': userAgent(),
        ...init.headers,
      },
      signal: AbortSignal.timeout(15000),
    })
  } catch (err) {
    throw externalServiceError('Melhor Envio', err)
  }

  if (!res.ok) {
    throw externalServiceError('Melhor Envio', new Error(`HTTP ${res.status}`))
  }

  return (await res.json()) as T
}
