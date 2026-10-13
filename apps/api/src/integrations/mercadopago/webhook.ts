import { createHmac } from 'node:crypto'
import { safeCompare } from '../../utils/crypto.js'

type VerifyInput = {
  /** Header `x-signature`: "ts=<ts>,v1=<hmac hex>". */
  signature: string | undefined
  /** Header `x-request-id`. */
  requestId: string | undefined
  /** Query param `data.id` da URL notificada — não o do corpo. */
  dataId: string | undefined
  secret: string
}

/**
 * Valida a origem de uma notificação do Mercado Pago.
 *
 * O manifest assinado é `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. Duas
 * regras do MP que o código não mostra: um par ausente na notificação sai do
 * manifest (em vez de entrar vazio), e um `data.id` alfanumérico — o "ORD01…" da
 * Orders API — entra em MINÚSCULAS. O SDK oficial não aplica a segunda; esquecê-la
 * faz toda notificação de order falhar na assinatura.
 */
export const verifyMpSignature = ({ signature, requestId, dataId, secret }: VerifyInput): boolean => {
  if (!signature || !secret) return false

  let ts: string | undefined
  let v1: string | undefined
  for (const part of signature.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === 'ts') ts = value
    else if (key === 'v1') v1 = value
  }
  if (!ts || !v1) return false

  const manifest =
    (dataId ? `id:${dataId.toLowerCase()};` : '') +
    (requestId ? `request-id:${requestId};` : '') +
    `ts:${ts};`

  const expected = createHmac('sha256', secret).update(manifest).digest('hex')
  return safeCompare(expected, v1.toLowerCase())
}
