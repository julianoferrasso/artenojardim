import { SESv2Client } from '@aws-sdk/client-sesv2'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { env, isEmailConfigured } from '../../config/env.js'
import { appError, externalServiceError } from '../../shared/errors.js'

/**
 * Instância única do SDK, criada sob demanda. Sem credencial a API sobe do mesmo
 * jeito (as vars são opcionais em env.ts fora de produção) — só o envio responde
 * 503 com mensagem clara. Mesma filosofia do Stripe e do Melhor Envio.
 */

let client: SESv2Client | null = null

export const getSes = (): SESv2Client => {
  if (!isEmailConfigured()) {
    // Não é "serviço fora do ar", é configuração ausente — mas para quem chamou
    // o efeito é o mesmo: não há como mandar e-mail agora. O log dirá o porquê.
    throw appError(ERROR_CODES.EXTERNAL_SERVICE_ERROR, 'Envio de e-mail indisponível no momento.', 503)
  }

  client ??= new SESv2Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    },
  })

  return client
}

/**
 * Fronteira de erro: nenhuma falha do SES vaza crua para o controller. O erro
 * original vai preso em `cause`, que só o log enxerga.
 */
export const translateSesError = (err: unknown): never => {
  throw externalServiceError('SES', err)
}
