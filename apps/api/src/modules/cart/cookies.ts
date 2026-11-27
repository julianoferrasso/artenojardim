import type { Request, Response } from 'express'
import { env, isProduction } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { mergeCarts } from './service.js'

/**
 * O cookie da sessão ANÔNIMA do carrinho — a borda HTTP do módulo, como o
 * `cookies.ts` do customer-auth. Mora fora do controller porque a verificação
 * do código (customer-auth) também mescla o carrinho, na própria resposta.
 *
 * O cookie não é restrito a um path como o de auth: ele precisa ser enviado em
 * toda chamada de carrinho.
 */
export const CART_SESSION_COOKIE = 'cart_session'

export const cartSessionCookieOptions = () =>
  ({
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    domain: env.COOKIE_DOMAIN,
    maxAge: 30 * 86400 * 1000,
  }) as const

export const readCartSession = (req: Request): string | undefined =>
  req.cookies?.[CART_SESSION_COOKIE] as string | undefined

const clearCartSession = (res: Response): void => {
  res.clearCookie(CART_SESSION_COOKIE, { domain: env.COOKIE_DOMAIN, path: '/' })
}

/**
 * Mescla o carrinho anônimo do navegador no do cliente que acabou de entrar.
 * Sem cookie, não faz nada. Devolve se mesclou.
 *
 * `strict: false` (a verificação do código): nunca lança — a sessão já foi
 * emitida, e uma falha aqui não pode virar "não consegui entrar". Sem limpar o
 * cookie, a loja ainda tenta pelo `/cart/merge` depois do login.
 */
export const mergeSessionCart = async (
  req: Request,
  res: Response,
  customerId: string,
  { strict }: { strict: boolean },
): Promise<boolean> => {
  const sessionToken = readCartSession(req)
  if (!sessionToken) return false

  try {
    await mergeCarts(sessionToken, customerId)
  } catch (err) {
    if (strict) throw err
    logger.error({ err, customerId }, 'não foi possível mesclar o carrinho na entrada pelo código')
    return false
  }
  // O carrinho anônimo foi consumido; limpa o cookie de sessão.
  clearCartSession(res)
  return true
}
