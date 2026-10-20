import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { env, isWhatsAppConfigured } from '../../config/env.js'
import { appError, isAppError, type AppError } from '../../shared/errors.js'

/**
 * WhatsApp Cloud API (Meta) por `fetch`. Mensagem que a empresa inicia só sai
 * por TEMPLATE aprovado na Meta — texto livre exige que a pessoa tenha escrito
 * nas últimas 24 h. Os nomes dos templates vêm do env; o texto deles está em
 * docs/alertas.md, e precisa bater com os parâmetros mandados aqui.
 *
 * "Enviado" aqui = a Meta ACEITOU. A entrega no aparelho é assíncrona e só
 * chegaria por webhook, que não existe (ainda).
 */

export { isWhatsAppConfigured }

/** O erro da Meta, sem token: vai para `cause` e para o log. */
export type WhatsAppFailure = {
  provider: 'whatsapp'
  /** HTTP da resposta. 0 = não houve resposta. */
  status: number
  /** `error.code` da Meta (ex.: 131026, 190). Null sem resposta. */
  code: number | null
  description: string
}

type MetaErrorBody = {
  error?: { message?: string; code?: number; error_data?: { details?: string } }
}

const failure = (f: WhatsAppFailure): AppError =>
  appError(
    ERROR_CODES.EXTERNAL_SERVICE_ERROR,
    `WhatsApp recusou o envio: ${f.description}`,
    f.status === 0 || f.status >= 500 ? 503 : 502,
    undefined,
    f,
  )

const isWhatsAppFailure = (value: unknown): value is WhatsAppFailure =>
  typeof value === 'object' && value !== null && (value as { provider?: unknown }).provider === 'whatsapp'

export const whatsAppFailureOf = (err: unknown): WhatsAppFailure | null =>
  isAppError(err) && isWhatsAppFailure(err.cause) ? err.cause : null

type TemplateMessage = {
  /** E.164 só com dígitos (5554999999999). */
  to: string
  template: string
  bodyParams: string[]
  /** Sufixo do botão de URL dinâmica (ou o código, no template de autenticação). */
  buttonUrlParam?: string
}

export const sendWhatsAppTemplate = async (m: TemplateMessage): Promise<void> => {
  if (!isWhatsAppConfigured()) {
    throw appError(ERROR_CODES.EXTERNAL_SERVICE_ERROR, 'WhatsApp não configurado no servidor.', 503)
  }

  const components: object[] = []
  if (m.bodyParams.length > 0) {
    components.push({ type: 'body', parameters: m.bodyParams.map((text) => ({ type: 'text', text })) })
  }
  if (m.buttonUrlParam !== undefined) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: m.buttonUrlParam }],
    })
  }

  let res: Response
  try {
    res = await fetch(
      `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: m.to,
          type: 'template',
          template: { name: m.template, language: { code: env.WHATSAPP_TEMPLATE_LANG }, components },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    )
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error'
    throw failure({
      provider: 'whatsapp',
      status: 0,
      code: null,
      description: name === 'TimeoutError' ? 'sem resposta da Meta' : 'falha de rede',
    })
  }

  if (res.ok) return

  const body = (await res.json().catch(() => ({}))) as MetaErrorBody
  const details = body.error?.error_data?.details
  throw failure({
    provider: 'whatsapp',
    status: res.status,
    code: body.error?.code ?? null,
    description: [body.error?.message ?? `HTTP ${res.status}`, details].filter(Boolean).join(' — '),
  })
}

/**
 * Template de AUTENTICAÇÃO com botão "copiar código". A Meta exige o código duas
 * vezes: no corpo e no botão (que, criado como OTP, a Meta guarda como URL).
 */
export const sendWhatsAppAuthCode = (to: string, code: string): Promise<void> =>
  sendWhatsAppTemplate({ to, template: env.WHATSAPP_OTP_TEMPLATE, bodyParams: [code], buttonUrlParam: code })

/**
 * O que a recusa diz, na língua da Meta:
 *  - `unreachable`: o número não recebe (sem WhatsApp, ou fora da lista de teste);
 *  - `bad_config`: token vencido, template inexistente ou com outro formato — é do servidor;
 *  - `transient`: rede, 5xx, limite de envio;
 *  - `rejected`: o resto (parâmetro recusado).
 */
export type WhatsAppFailureKind = 'unreachable' | 'bad_config' | 'transient' | 'rejected'

const BAD_CONFIG = new Set([190, 10, 200, 132000, 132001, 132005, 132007, 132012, 132015, 132016, 133010])
const UNREACHABLE = new Set([131026, 131030])
const TRANSIENT = new Set([4, 80007, 130429, 131000, 131016, 131048, 131056])

export const classifyWhatsAppFailure = (f: WhatsAppFailure): WhatsAppFailureKind => {
  if (f.status === 0 || f.status >= 500 || (f.code !== null && TRANSIENT.has(f.code))) return 'transient'
  if (f.code !== null && BAD_CONFIG.has(f.code)) return 'bad_config'
  if (f.status === 401) return 'bad_config'
  if (f.code !== null && UNREACHABLE.has(f.code)) return 'unreachable'
  return 'rejected'
}
