import Stripe from 'stripe'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { env } from '../../config/env.js'
import { appError, businessError, externalServiceError } from '../../shared/errors.js'

/**
 * Instância única do SDK, criada sob demanda. Sem STRIPE_SECRET a API sobe do
 * mesmo jeito (a var é opcional em env.ts) — só a cobrança responde 503 com
 * mensagem clara, em vez de derrubar o boot. Mesma filosofia do Melhor Envio.
 */

let client: Stripe | null = null

export const getStripe = (): Stripe => {
  if (!env.STRIPE_SECRET) {
    // Não é "serviço fora do ar", é configuração ausente — mas para o cliente o
    // efeito é o mesmo: pagamento indisponível agora. O log dirá o porquê.
    throw appError(ERROR_CODES.EXTERNAL_SERVICE_ERROR, 'Pagamento indisponível no momento.', 503)
  }
  if (!client) client = new Stripe(env.STRIPE_SECRET)
  return client
}

/** A publishable NÃO é segredo — vai para o front montar o Payment Element. */
export const getPublishableKey = (): string | null => env.STRIPE_PUBLIC ?? null

/**
 * Fronteira de erro: um cartão recusado é 402 de negócio (o front reage ao code),
 * não um 500 assustador. Qualquer outra falha do Stripe vira externalServiceError
 * (503) com o erro cru preso em `cause` — que vai só para o log, nunca ao cliente.
 * Sempre lança: o tipo de retorno `never` deixa o compilador saber disso.
 */
export const translateStripeError = (err: unknown): never => {
  if (err instanceof Stripe.errors.StripeCardError) {
    throw businessError(ERROR_CODES.PAYMENT_DECLINED, 'Pagamento recusado pelo emissor do cartão.', 402)
  }
  throw externalServiceError('Stripe', err)
}
