import { externalServiceError } from '../../shared/errors.js'
import { getMeAppConfig } from './config.js'
import { getValidAccessToken } from './token.js'

/**
 * Requisição autenticada à API do Melhor Envio. Anexa o Bearer válido (renovado
 * por token.ts) e o User-Agent que eles EXIGEM: aplicação + e-mail de contato —
 * sem isso a API responde 403.
 */

export const meRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const [token, { baseUrl, userAgent }] = await Promise.all([getValidAccessToken(), getMeAppConfig()])

  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': userAgent,
        ...init.headers,
      },
      signal: AbortSignal.timeout(15000),
    })
  } catch (err) {
    throw externalServiceError('Melhor Envio', err)
  }

  if (!res.ok) {
    // O texto do ME vai só para o `cause` (logado pelo error-handler), nunca
    // para o cliente. Truncado: um 422 de validação lista campo a campo.
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw externalServiceError('Melhor Envio', new Error(`HTTP ${res.status} ${detail}`.trim()))
  }

  return (await res.json()) as T
}
