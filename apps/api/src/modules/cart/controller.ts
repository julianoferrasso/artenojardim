import type { Request, Response } from 'express'
import type { AddToCartInput, UpdateCartItemInput } from '@ecommerce/shared/contracts'
import { env, isProduction } from '../../config/env.js'
import { ok } from '../../shared/http.js'
import * as service from './service.js'

/**
 * O carrinho é do CLIENTE logado (req.auth) ou de uma SESSÃO anônima (cookie).
 * O cookie de sessão não é HttpOnly-restrito a um path como o de auth — ele
 * precisa ser enviado em toda chamada de carrinho.
 */
const CART_SESSION_COOKIE = 'cart_session'

const sessionCookieOptions = () =>
  ({
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    domain: env.COOKIE_DOMAIN,
    maxAge: 30 * 86400 * 1000,
  }) as const

/**
 * Resolve o dono do carrinho e garante que ele exista. Cliente logado → por
 * customerId. Anônimo → por sessionToken do cookie; se não houver, cria um e
 * seta o cookie (é o único ponto que emite o cookie de sessão).
 */
const resolveOwner = async (
  req: Request,
  res: Response,
): Promise<{ cartId: string }> => {
  if (req.auth?.type === 'customer') {
    return service.resolveCart({ customerId: req.auth.sub })
  }

  const existing = req.cookies?.[CART_SESSION_COOKIE] as string | undefined
  const sessionToken = existing ?? service.generateSessionToken()

  const result = await service.resolveCart({ sessionToken })

  if (!existing) {
    res.cookie(CART_SESSION_COOKIE, sessionToken, sessionCookieOptions())
  }
  return { cartId: result.cartId }
}

export const getCartController = async (req: Request, res: Response): Promise<void> => {
  const { cartId } = await resolveOwner(req, res)
  ok(res, await service.getCart(cartId))
}

export const addItemController = async (req: Request, res: Response): Promise<void> => {
  const { cartId } = await resolveOwner(req, res)
  ok(res, await service.addItem(cartId, req.body as AddToCartInput))
}

export const updateItemController = async (req: Request, res: Response): Promise<void> => {
  const { cartId } = await resolveOwner(req, res)
  const { quantity } = req.body as UpdateCartItemInput
  ok(res, await service.updateItem(cartId, req.params['itemId'] as string, quantity))
}

export const removeItemController = async (req: Request, res: Response): Promise<void> => {
  const { cartId } = await resolveOwner(req, res)
  ok(res, await service.removeItem(cartId, req.params['itemId'] as string))
}

/**
 * Mescla o carrinho anônimo no do cliente. Chamado pela loja logo após o login,
 * com o cookie de sessão anônima ainda presente. Idempotente.
 */
export const mergeController = async (req: Request, res: Response): Promise<void> => {
  if (req.auth?.type !== 'customer') {
    ok(res, { merged: false })
    return
  }
  const sessionToken = req.cookies?.[CART_SESSION_COOKIE] as string | undefined
  if (!sessionToken) {
    ok(res, { merged: false })
    return
  }

  await service.mergeCarts(sessionToken, req.auth.sub)
  // O carrinho anônimo foi consumido; limpa o cookie de sessão.
  res.clearCookie(CART_SESSION_COOKIE, { domain: env.COOKIE_DOMAIN, path: '/' })
  ok(res, { merged: true })
}
