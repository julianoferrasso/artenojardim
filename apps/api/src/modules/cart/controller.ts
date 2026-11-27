import type { Request, Response } from 'express'
import type { AddToCartInput, UpdateCartItemInput } from '@ecommerce/shared/contracts'
import { ok } from '../../shared/http.js'
import { CART_SESSION_COOKIE, cartSessionCookieOptions, mergeSessionCart, readCartSession } from './cookies.js'
import * as service from './service.js'

/**
 * O carrinho é do CLIENTE logado (req.auth) ou de uma SESSÃO anônima (cookie,
 * ver `cookies.ts`).
 */

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

  const existing = readCartSession(req)
  const sessionToken = existing ?? service.generateSessionToken()

  const result = await service.resolveCart({ sessionToken })

  if (!existing) {
    res.cookie(CART_SESSION_COOKIE, sessionToken, cartSessionCookieOptions())
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
  ok(res, { merged: await mergeSessionCart(req, res, req.auth.sub, { strict: true }) })
}
