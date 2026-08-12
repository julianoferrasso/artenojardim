import { SendEmailCommand } from '@aws-sdk/client-sesv2'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { getSes, translateSesError } from './client.js'

/** O que um template produz. Sempre as duas versões: cliente de e-mail que não
 *  renderiza HTML (ou leitor de tela) fica com o texto. */
export type EmailContent = {
  subject: string
  html: string
  text: string
}

export type SendEmailInput = EmailContent & {
  to: string
  /** Correlaciona bounce/complaint no SES com o e-mail que originou. Só rótulo:
   *  o SES rejeita valores fora de [A-Za-z0-9_-]. */
  tags?: Record<string, string>
}

export const sendEmail = async (input: SendEmailInput): Promise<void> => {
  // Antes de montar o comando: sem credencial, `env.EMAIL_FROM` é undefined e o
  // From viraria a string "undefined <undefined>". Falhar aqui deixa o erro
  // legível em vez de virar rejeição do SES.
  const client = getSes()

  const command = new SendEmailCommand({
    FromEmailAddress: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
    // Sem EMAIL_REPLY_TO não mandamos o cabeçalho: cair de volta no próprio
    // noreply criaria um endereço de resposta que ninguém lê, o que é pior que
    // não oferecer nenhum.
    ...(env.EMAIL_REPLY_TO ? { ReplyToAddresses: [env.EMAIL_REPLY_TO] } : {}),
    Destination: { ToAddresses: [input.to] },
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: input.html, Charset: 'UTF-8' },
          Text: { Data: input.text, Charset: 'UTF-8' },
        },
      },
    },
    ...(input.tags
      ? { EmailTags: Object.entries(input.tags).map(([Name, Value]) => ({ Name, Value })) }
      : {}),
  })

  try {
    await client.send(command)
  } catch (err) {
    translateSesError(err)
  }
}

/**
 * Envia sem nunca lançar. Para quando a falha de e-mail não pode derrubar a
 * operação de negócio (ex.: reenvio disparado por uma resposta que já é genérica
 * por decisão de segurança). Devolve `false` para quem quiser reagir.
 *
 * NÃO logamos o corpo nem o assunto: o corpo carrega o token cru do link.
 */
export const sendEmailSafe = async (input: SendEmailInput): Promise<boolean> => {
  try {
    await sendEmail(input)
    return true
  } catch (err) {
    logger.error({ err, template: input.tags?.template }, 'falha ao enviar e-mail')
    return false
  }
}
