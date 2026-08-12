import type { Response } from 'express'
import { ROUTES } from '@ecommerce/shared/constants'
import { env, isProduction } from '../../config/env.js'
import { ok } from '../../shared/http.js'
import type { CustomerSession } from './service.js'

/**
 * Cookie de sessão do CLIENTE e a resposta que o acompanha.
 *
 * Extraído do controller porque dois módulos emitem sessão de cliente: o login/
 * refresh daqui e a troca de senha (`customer-profile/credentials.ts`), que
 * reemite para a aba atual sobreviver à revogação. Duplicar o `res.cookie` é
 * como o `path` diverge numa das cópias e o cookie de refresh some sem erro
 * nenhum — o sintoma seria "o cliente é deslogado ao recarregar", longe da causa.
 */

/**
 * Nome distinto do cookie de staff. Um mesmo navegador pode ter as duas sessões
 * (o dono da loja comprando na própria loja), e elas não se cruzam.
 */
export const CUSTOMER_REFRESH_COOKIE = 'customer_refresh_token'

export const cookieOptions = () =>
  ({
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    domain: env.COOKIE_DOMAIN,
    // Restrito ao endpoint de refresh de cliente: nem é enviado nas outras rotas.
    path: ROUTES.auth.refresh,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400 * 1000,
  }) as const

/**
 * Grava o cookie de refresh e devolve o envelope de sessão.
 *
 * O `path` restringe o ENVIO do cookie, não a gravação: um Set-Cookie vindo de
 * `/customers/me/password` com `Path=/api/v1/auth/refresh` é guardado igual pelo
 * navegador e viaja no próximo refresh.
 */
export const respondWithSession = (res: Response, result: CustomerSession): void => {
  res.cookie(CUSTOMER_REFRESH_COOKIE, result.refreshToken, cookieOptions())
  ok(res, {
    customer: result.customer,
    tokens: { accessToken: result.accessToken, expiresIn: result.expiresIn },
  })
}
