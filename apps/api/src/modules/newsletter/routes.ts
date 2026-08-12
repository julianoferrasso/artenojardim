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
 *
 * O token é aceito no CORPO ou na QUERY, e não é redundância: o one-click do
 * Gmail (List-Unsubscribe-Post) faz um POST para a URL do cabeçalho com um corpo
 * FIXO — `List-Unsubscribe=One-Click` — que não tem o nosso token. Sem o
 * `?token=` da query, esse caminho não teria como identificar ninguém.
 *
 * Por isso a validação não usa `validate({ body })`: o corpo do one-click não
 * casa com o schema, e o middleware o rejeitaria antes do controller.
 */
newsletterRoutes.post('/unsubscribe', unsubscribeLimiter, controller.unsubscribeController)
