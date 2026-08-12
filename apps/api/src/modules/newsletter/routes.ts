import { Router } from 'express'
import { subscribeNewsletterSchema, unsubscribeSchema } from '@ecommerce/shared/contracts'
import { validate } from '../../middlewares/validate.js'
import { newsletterLimiter, unsubscribeLimiter } from '../../middlewares/rate-limit.js'
import * as controller from './controller.js'

/** Rota PÚBLICA: o footer/home da loja inscreve visitantes anônimos. */
export const newsletterRoutes: Router = Router()

newsletterRoutes.post(
  '/subscribe',
  newsletterLimiter,
  validate({ body: subscribeNewsletterSchema }),
  controller.subscribeController,
)

/**
 * Descadastro pelo rodapé do e-mail. Pública e sem login — quem assinou pelo
 * footer não tem conta, e exigir uma para sair transformaria "descadastrar" em
 * "marcar como spam".
 *
 * POST e não GET: um GET que muda estado é disparado pelo pré-carregador de
 * links do Outlook e por antivírus de e-mail, sem ninguém clicar em nada. A
 * página da loja faz o POST depois de carregar.
 */
newsletterRoutes.post(
  '/unsubscribe',
  unsubscribeLimiter,
  validate({ body: unsubscribeSchema }),
  controller.unsubscribeController,
)
